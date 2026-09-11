/**
 * controller-battery.cjs
 * Monitoramento de bateria via node-hid (processo Electron main — sem PowerShell).
 *
 * IMPORTANTE: Os offsets de byte aqui são para node-hid (processo Electron),
 * que INCLUI o reportId em data[0] e adiciona headers BT.
 * São DIFERENTES dos offsets do WebHID/browser (que não inclui reportId).
 *
 * Offset calibrado empiricamente via dump de reports reais:
 *   DS4 BT (report 0x11):  byte[7]   → bateria (nibble baixo 0-8, nibble alto = charging)
 *   DS4 USB (report 0x01): byte[13]  → bateria
 *   DualSense BT (0x31):   byte[54]  → bateria
 *   DualSense USB (0x01):  byte[53]  → bateria
 *
 * Detecção de transporte: path HID contém "00001124"/"bth" → Bluetooth, senão USB.
 */

"use strict";

const SONY_VID        = 0x054c;
const XBOX_VID        = 0x045e;
const DUALSENSE_PIDS  = new Set([0x0ce6, 0x0df2]);
const DUALSHOCK4_PIDS = new Set([0x05c4, 0x09cc]);

// ── Detecta tipo de transporte pelo path HID ─────────────────────────────────
function detectTransport(hidPath) {
  if (!hidPath) return "unknown";
  const p = hidPath.toLowerCase();
  if (p.includes("00001124") || p.includes("bth") || p.includes("bluetooth") || p.includes("bthle")) {
    return "bluetooth";
  }
  return "usb";
}

// ── Parser DualSense (node-hid offsets) ──────────────────────────────────────
// Nibble alto do byte de bateria: 0x0=descarregando, 0x1=carregando, 0x2=completo
function parseDualSenseByte(batByte) {
  const rawLevel   = batByte & 0x0f;
  const chgNibble  = (batByte & 0xf0) >> 4;
  const isCharging = chgNibble === 0x1;
  const level      = Math.min(100, Math.max(0, rawLevel * 10));
  return { level, isCharging };
}

// ── Parser DualShock 4 (node-hid offsets) ────────────────────────────────────
// Nibble baixo 0-8 → escala para 0-100%. Bit 4 = carregando.
function parseDualShock4Byte(batByte) {
  const rawLevel   = batByte & 0x0f;
  const isCharging = (batByte & 0x10) !== 0;
  const level      = Math.min(100, Math.max(0, Math.round((rawLevel / 8) * 100)));
  return { level, isCharging };
}

function parseSonyReport(data, isDualSense, transport) {
  if (!data || data.length < 2) return null;
  const reportId = data[0];

  if (isDualSense) {
    // DualSense BT: report 0x31, byte de bateria em data[54]
    if (reportId === 0x31 && data.length >= 55) {
      const { level, isCharging } = parseDualSenseByte(data[54]);
      if (level > 0 || isCharging) return { level, isCharging, transport, deviceName: "PlayStation DualSense" };
    }
    // DualSense USB: report 0x01, byte de bateria em data[53]
    if (reportId === 0x01 && data.length >= 54) {
      const { level, isCharging } = parseDualSenseByte(data[53]);
      return { level, isCharging, transport, deviceName: "PlayStation DualSense" };
    }
  } else {
    // DS4 BT: report 0x11, byte de bateria em data[7]
    if (reportId === 0x11 && data.length >= 8) {
      const { level, isCharging } = parseDualShock4Byte(data[7]);
      if (level > 0 || isCharging) return { level, isCharging, transport, deviceName: "PlayStation DualShock 4" };
    }
    // DS4 USB: report 0x01, byte de bateria em data[13]
    if (reportId === 0x01 && data.length >= 14) {
      const { level, isCharging } = parseDualShock4Byte(data[13]);
      return { level, isCharging, transport, deviceName: "PlayStation DualShock 4" };
    }
  }
  return null;
}

// ── node-hid lazy load ───────────────────────────────────────────────────────
let _hid = null;
function getHid() {
  if (!_hid) _hid = require("node-hid");
  return _hid;
}

// ── Leitura Sony HID ─────────────────────────────────────────────────────────
async function readSonyHidBattery() {
  let HID;
  try { HID = getHid(); } catch { return null; }

  let candidates;
  try {
    candidates = HID.devices().filter(d => {
      if (d.vendorId !== SONY_VID) return false;
      // Filtrar pela usage page de gamepad (1) para evitar interfaces de áudio/mic
      return (DUALSENSE_PIDS.has(d.productId) || DUALSHOCK4_PIDS.has(d.productId)) &&
             d.usagePage === 1;
    });
  } catch { return null; }

  for (const dev of candidates) {
    if (!dev.path) continue;
    let device = null;
    try {
      device = new HID.HID(dev.path);
      const transport  = detectTransport(dev.path);
      const isDualSense = DUALSENSE_PIDS.has(dev.productId);

      // Lê até 3 reports (às vezes os primeiros são reports de inicialização)
      let result = null;
      for (let attempt = 0; attempt < 3 && !result; attempt++) {
        const data = device.readTimeout(600);
        if (data && data.length > 0) {
          result = parseSonyReport(data, isDualSense, transport);
        }
      }

      device.close();
      device = null;

      if (result) return result;

    } catch (err) {
      try { device?.close(); } catch { /* ignore */ }
      // Tenta próximo candidato
    }
  }
  return null;
}

// ── Fallback XInput para Xbox ─────────────────────────────────────────────────
const { execFile } = require("child_process");

let _xboxCache = null;
let _xboxCacheTime = 0;

function queryXboxViaPowerShell() {
  const now = Date.now();
  if (now - _xboxCacheTime < 5000 && _xboxCache !== undefined) {
    return Promise.resolve(_xboxCache);
  }

  return new Promise((resolve) => {
    const script = `
try {
  Add-Type -TypeDefinition @'
    using System; using System.Runtime.InteropServices;
    public class XI3 {
      [StructLayout(LayoutKind.Sequential)]
      public struct XINPUT_BATTERY_INFORMATION { public byte BatteryType; public byte BatteryLevel; }
      [DllImport("xinput1_4.dll")] public static extern int XInputGetBatteryInformation(int u, byte t, ref XINPUT_BATTERY_INFORMATION i);
      public static string Check() {
        for(int i=0;i<4;i++){
          var info=new XINPUT_BATTERY_INFORMATION();
          if(XInputGetBatteryInformation(i,0,ref info)==0 && info.BatteryType!=0)
            return i+":"+info.BatteryType+":"+info.BatteryLevel;
        }
        return "NONE";
      }
    }
'@ -ErrorAction SilentlyContinue
  Write-Output ([XI3]::Check())
} catch { Write-Output "NONE" }`;

    execFile(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 5000 },
      (err, stdout) => {
        const raw = stdout?.trim() ?? "";
        if (err || raw === "NONE" || !raw) {
          _xboxCache = null; _xboxCacheTime = now;
          resolve(null); return;
        }
        const parts = raw.split(":");
        if (parts.length < 3) { _xboxCache = null; _xboxCacheTime = now; resolve(null); return; }
        const bType  = parseInt(parts[1], 10);
        const bLevel = parseInt(parts[2], 10);
        let result;
        if (bType === 1) {
          // Wired
          result = { level: 100, isCharging: true, transport: "usb", deviceName: "Xbox Controller" };
        } else {
          // Wireless: XInput tem apenas 4 níveis (EMPTY=0, LOW=1, MEDIUM=2, FULL=3)
          const lvlMap = [10, 35, 70, 100];
          result = { level: lvlMap[bLevel] ?? 100, isCharging: false, transport: "bluetooth", deviceName: "Xbox Controller" };
        }
        _xboxCache = result; _xboxCacheTime = now;
        resolve(result);
      }
    );
  });
}

// ── Estado e API pública ──────────────────────────────────────────────────────
let lastQueryTime = 0;
let pendingQuery  = null;
let cachedResult  = {
  batteryLevel:   null,
  isCharging:     false,
  connectionType: "unknown",
  deviceName:     null,
};

async function queryWindowsControllerBattery() {
  const now = Date.now();

  // Cache de 1.5s
  if (now - lastQueryTime < 1500 && cachedResult.connectionType !== "unknown") {
    return cachedResult;
  }
  if (pendingQuery) return pendingQuery;

  lastQueryTime = now;

  pendingQuery = (async () => {
    try {
      // 1. Sony via node-hid (DualSense / DualShock 4)
      const sony = await readSonyHidBattery();
      if (sony) {
        cachedResult = {
          batteryLevel:   sony.level,
          isCharging:     sony.isCharging,
          connectionType: sony.transport,
          deviceName:     sony.deviceName,
        };
        return cachedResult;
      }

      // 2. Xbox via XInput
      const xbox = await queryXboxViaPowerShell();
      if (xbox) {
        cachedResult = {
          batteryLevel:   xbox.level,
          isCharging:     xbox.isCharging,
          connectionType: xbox.transport,
          deviceName:     xbox.deviceName,
        };
        return cachedResult;
      }

      // 3. Sem controle detectado
      return cachedResult;

    } catch (err) {
      console.warn("[controller-battery] Erro:", err?.message ?? err);
      return cachedResult;
    } finally {
      pendingQuery = null;
    }
  })();

  return pendingQuery;
}

module.exports = { queryWindowsControllerBattery };
