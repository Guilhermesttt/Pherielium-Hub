param(
  [Parameter(Mandatory = $true)][string]$ExecutablePath,
  [Parameter(Mandatory = $true)][ValidateSet('borderless', 'windowed')][string]$WindowMode,
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [Parameter(Mandatory = $true)][int]$Width,
  [Parameter(Mandatory = $true)][int]$Height
)

$signature = @'
using System;
using System.Runtime.InteropServices;
public static class CheckpointWindowProfile {
  [DllImport("user32.dll", SetLastError = true)] public static extern int GetWindowLong(IntPtr hWnd, int index);
  [DllImport("user32.dll", SetLastError = true)] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int width, int height, uint flags);
}
'@

Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue
$target = [System.IO.Path]::GetFullPath($ExecutablePath)
$handle = [IntPtr]::Zero

for ($attempt = 0; $attempt -lt 40 -and $handle -eq [IntPtr]::Zero; $attempt++) {
  $process = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    try { [System.IO.Path]::GetFullPath($_.Path) -eq $target } catch { $false }
  } | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($process) { $handle = $process.MainWindowHandle }
  if ($handle -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 500 }
}

if ($handle -eq [IntPtr]::Zero) { exit 2 }

$GWL_STYLE = -16
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000
$WS_SYSMENU = 0x00080000
$style = [CheckpointWindowProfile]::GetWindowLong($handle, $GWL_STYLE)
if ($WindowMode -eq 'borderless') {
  $style = $style -band (-bnot ($WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU))
} else {
  $style = $style -bor $WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU
}
[void][CheckpointWindowProfile]::SetWindowLong($handle, $GWL_STYLE, $style)
[void][CheckpointWindowProfile]::SetWindowPos($handle, [IntPtr]::Zero, $X, $Y, $Width, $Height, 0x0040)
