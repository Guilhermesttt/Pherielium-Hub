"use strict";

const path = require("node:path");

const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const DEFAULT_TRANSITION_GRACE_MS = 30_000;
const DEFAULT_ABSENCE_THRESHOLD = 3;
const DEFAULT_REPLACEMENT_STABILITY = 2;

const normalizeWindowsPath = (value) => {
  const text = String(value || "").trim();
  return text ? path.win32.normalize(text).toLowerCase() : "";
};

const normalizeProcessRecord = (value) => {
  const pid = Number(value?.pid ?? value?.ProcessId ?? 0);
  const parentPid = Number(value?.parentPid ?? value?.ParentProcessId ?? 0);
  const executablePath = normalizeWindowsPath(
    value?.executablePath ?? value?.ExecutablePath ?? "",
  );
  const rawName = String(value?.name ?? value?.Name ?? "").trim().toLowerCase();
  const name = rawName || (executablePath ? path.win32.basename(executablePath) : "");
  return {
    pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
    parentPid: Number.isInteger(parentPid) && parentPid > 0 ? parentPid : 0,
    name,
    executablePath,
  };
};

const parseProcessSnapshot = (stdout) => {
  const text = String(stdout || "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return values
    .map(normalizeProcessRecord)
    .filter((record) => record.pid > 0 && record.name);
};

const parseTasklistProcessNames = (stdout, minimumWorkingSetKb = 1024) => {
  const names = new Set();
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const fields = (line.match(/"(?:[^"]|"")*"/g) || [])
      .map((field) => field.slice(1, -1).replace(/""/g, '"'));
    const name = String(fields[0] || "").trim().toLowerCase();
    if (!name) continue;

    const memoryDigits = String(fields.at(-1) || "").replace(/\D/g, "");
    const workingSetKb = memoryDigits ? Number(memoryDigits) : null;
    if (workingSetKb != null && workingSetKb < minimumWorkingSetKb) continue;
    names.add(name);
  }
  return names;
};

const isPathInside = (rootPath, candidatePath) => {
  const root = normalizeWindowsPath(rootPath);
  const candidate = normalizeWindowsPath(candidatePath);
  if (!root || !candidate) return false;
  const relative = path.win32.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.win32.isAbsolute(relative));
};

const TARGET_LAUNCHER_PATTERN = /(?:launcher|bootstrap|patcher|updater|loader)|(?:^|[._ -])(?:launch|start|client|update)(?:[._ -]|$)/i;
const CANDIDATE_HELPER_PATTERN = /(?:crash|reporter|updat(?:e|er)|unins|helper|service|overlay|steamwebhelper|cef|easyanticheat|eac_launcher|battleye|bootstrapper|launcher)/i;

const isLikelyLauncher = (name) => TARGET_LAUNCHER_PATTERN.test(String(name || ""));
const isLikelyHelper = (name) => CANDIDATE_HELPER_PATTERN.test(String(name || ""));

const processSearchRoot = (targetPath) => {
  const targetDirectory = path.win32.dirname(targetPath);
  const directoryName = path.win32.basename(targetDirectory);
  if (/^(?:launcher|bin|binaries|win32|win64|x86|x64)$/i.test(directoryName)) {
    return path.win32.dirname(targetDirectory);
  }
  return targetDirectory;
};

const addDescendants = (processes, trackedPids) => {
  let changed = true;
  while (changed) {
    changed = false;
    for (const processRecord of processes) {
      if (
        processRecord.pid > 0
        && processRecord.parentPid > 0
        && trackedPids.has(processRecord.parentPid)
        && !trackedPids.has(processRecord.pid)
      ) {
        trackedPids.add(processRecord.pid);
        changed = true;
      }
    }
  }
};

const createGameProcessTracker = ({
  targetPath,
  rootPid = 0,
  baselineProcesses = [],
  startedAt = Date.now(),
  startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
  transitionGraceMs = DEFAULT_TRANSITION_GRACE_MS,
  absenceThreshold = DEFAULT_ABSENCE_THRESHOLD,
  replacementStableObservations = DEFAULT_REPLACEMENT_STABILITY,
} = {}) => {
  const normalizedTargetPath = normalizeWindowsPath(targetPath);
  if (!normalizedTargetPath || path.win32.extname(normalizedTargetPath) !== ".exe") {
    throw new Error("Executable target is required for process tracking.");
  }

  const targetName = path.win32.basename(normalizedTargetPath);
  const searchRoot = processSearchRoot(normalizedTargetPath);
  const baselinePids = new Set(
    baselineProcesses.map(normalizeProcessRecord).map((record) => record.pid).filter(Boolean),
  );
  const trackedPids = new Set(Number(rootPid) > 0 ? [Number(rootPid)] : []);
  const candidateStability = new Map();
  let targetSeen = false;
  let sessionSeen = false;
  let adoptedCandidateKey = "";
  let adoptedProcessPid = 0;
  let adoptedExecutablePath = "";
  let adoptedExecutableName = "";
  let transitionStartedAt = 0;
  let absentChecks = 0;
  let finished = false;

  const observe = (rawProcesses, now = Date.now()) => {
    if (finished) {
      return {
        status: "finished",
        activeExecutablePath: adoptedExecutablePath || normalizedTargetPath,
        adopted: Boolean(adoptedCandidateKey),
      };
    }

    const processes = rawProcesses.map(normalizeProcessRecord).filter((record) => record.name);
    const processByPid = new Map(processes.filter((record) => record.pid > 0).map((record) => [record.pid, record]));
    const rootActive = Number(rootPid) > 0 && processByPid.has(Number(rootPid));
    const targetProcesses = processes.filter((record) => (
      record.executablePath === normalizedTargetPath
      || (!record.executablePath && record.name === targetName)
      || (Number(rootPid) > 0 && record.pid === Number(rootPid))
    ));
    const targetPids = new Set(targetProcesses.map((record) => record.pid).filter(Boolean));

    targetProcesses.forEach((record) => {
      if (record.pid > 0) trackedPids.add(record.pid);
    });
    addDescendants(processes, trackedPids);

    const targetActive = rootActive || targetProcesses.length > 0;
    if (targetActive) {
      targetSeen = true;
      sessionSeen = true;
    }

    const candidateByPath = new Map();
    for (const record of processes) {
      if (record.pid > 0 && targetPids.has(record.pid)) continue;
      if (record.executablePath === normalizedTargetPath || isLikelyHelper(record.name)) continue;
      if (record.executablePath && path.win32.extname(record.executablePath) !== ".exe") continue;

      const descendant = record.pid > 0 && trackedPids.has(record.pid);
      const newInGameDirectory = record.pid > 0
        && Boolean(record.executablePath)
        && !baselinePids.has(record.pid)
        && isPathInside(searchRoot, record.executablePath);
      if (!descendant && !newInGameDirectory) continue;

      // Elevated children may hide ExecutablePath from a non-elevated launcher.
      // A tracked PID is still a qualified identity and is safer than falling
      // back to a global process-name match.
      const candidateKey = record.executablePath || `pid:${record.pid}`;
      const existing = candidateByPath.get(candidateKey);
      const score = (isPathInside(searchRoot, record.executablePath) ? 100 : 0)
        + (descendant ? 60 : 0)
        + (trackedPids.has(record.parentPid) ? 20 : 0)
        + (!baselinePids.has(record.pid) ? 10 : 0);
      if (!existing || score > existing.score) {
        candidateByPath.set(candidateKey, { record, score });
      }
    }

    for (const key of Array.from(candidateStability.keys())) {
      if (!candidateByPath.has(key)) candidateStability.delete(key);
    }
    for (const key of candidateByPath.keys()) {
      candidateStability.set(key, (candidateStability.get(key) || 0) + 1);
    }

    const stableReplacement = Array.from(candidateByPath.entries())
      .filter(([key]) => (candidateStability.get(key) || 0) >= replacementStableObservations)
      .sort(([, first], [, second]) => second.score - first.score)[0];

    const adoptedStillActive = adoptedCandidateKey
      ? processes.some((record) => (
        (adoptedProcessPid > 0 && record.pid === adoptedProcessPid)
        || (adoptedExecutablePath && record.executablePath === adoptedExecutablePath)
        || (!record.executablePath && record.name === adoptedExecutableName)
      ))
      : false;

    if (
      stableReplacement
      && (!adoptedCandidateKey || !adoptedStillActive)
      && (!targetActive || isLikelyLauncher(targetName) || Boolean(adoptedCandidateKey))
    ) {
      adoptedCandidateKey = stableReplacement[0];
      adoptedProcessPid = stableReplacement[1].record.pid;
      adoptedExecutablePath = stableReplacement[1].record.executablePath;
      adoptedExecutableName = stableReplacement[1].record.name;
      sessionSeen = true;
      absentChecks = 0;
      transitionStartedAt = 0;
    }

    const adoptedActive = adoptedCandidateKey
      ? processes.some((record) => (
        (adoptedProcessPid > 0 && record.pid === adoptedProcessPid)
        || (adoptedExecutablePath && record.executablePath === adoptedExecutablePath)
        || (!record.executablePath && record.name === adoptedExecutableName)
      ))
      : false;

    if (adoptedCandidateKey) {
      if (adoptedActive) {
        absentChecks = 0;
        return {
          status: "running",
          activeExecutablePath: adoptedExecutablePath || normalizedTargetPath,
          adopted: true,
        };
      }
      absentChecks += 1;
      if (absentChecks < absenceThreshold) {
        return {
          status: "transition",
          activeExecutablePath: adoptedExecutablePath || normalizedTargetPath,
          adopted: true,
        };
      }
      finished = true;
      return {
        status: "finished",
        activeExecutablePath: adoptedExecutablePath || normalizedTargetPath,
        adopted: true,
      };
    }

    if (targetActive) {
      absentChecks = 0;
      transitionStartedAt = 0;
      if (isLikelyLauncher(targetName) && now - startedAt >= startupTimeoutMs) {
        finished = true;
        return {
          status: "finished",
          activeExecutablePath: normalizedTargetPath,
          adopted: false,
        };
      }
      return {
        status: "running",
        activeExecutablePath: normalizedTargetPath,
        adopted: false,
      };
    }

    if (!sessionSeen) {
      if (now - startedAt < startupTimeoutMs) {
        return {
          status: "starting",
          activeExecutablePath: normalizedTargetPath,
          adopted: false,
        };
      }
      finished = true;
      return {
        status: "finished",
        activeExecutablePath: normalizedTargetPath,
        adopted: false,
      };
    }

    const hasReplacementSignal = candidateByPath.size > 0 || isLikelyLauncher(targetName);
    if (targetSeen && hasReplacementSignal) {
      if (!transitionStartedAt) transitionStartedAt = now;
      if (now - transitionStartedAt < transitionGraceMs) {
        return {
          status: "transition",
          activeExecutablePath: normalizedTargetPath,
          adopted: false,
        };
      }
      finished = true;
      return {
        status: "finished",
        activeExecutablePath: normalizedTargetPath,
        adopted: false,
      };
    }

    absentChecks += 1;
    if (absentChecks < absenceThreshold) {
      return {
        status: "transition",
        activeExecutablePath: normalizedTargetPath,
        adopted: false,
      };
    }
    finished = true;
    return {
      status: "finished",
      activeExecutablePath: normalizedTargetPath,
      adopted: false,
    };
  };

  return {
    observe,
    getState: () => ({
      targetPath: normalizedTargetPath,
      targetName,
      trackedPids: Array.from(trackedPids),
      adoptedCandidateKey,
      adoptedProcessPid,
      adoptedExecutablePath,
      adoptedExecutableName,
      targetSeen,
      sessionSeen,
      finished,
    }),
  };
};

module.exports = {
  createGameProcessTracker,
  isLikelyHelper,
  isLikelyLauncher,
  isPathInside,
  normalizeProcessRecord,
  normalizeWindowsPath,
  parseTasklistProcessNames,
  parseProcessSnapshot,
};
