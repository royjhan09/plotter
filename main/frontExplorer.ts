import { spawn } from 'node:child_process'
import { dirname } from 'node:path'

/**
 * Dev browser mode only: Plotter has no window there, so Windows keeps the File Explorer window that
 * "Show in folder" opens behind the app you are using. This finds that Explorer window and brings it forward
 * (a tap of Alt first, which Windows needs before it lets a background process change the front window).
 * The folder is passed in an environment variable, never inside the script text.
 */
const SCRIPT = `
Add-Type @'
using System; using System.Runtime.InteropServices;
public class PlotterFront {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
'@
$want = [IO.Path]::GetFullPath($env:PLOTTER_FOLDER).TrimEnd('\\')
for ($i = 0; $i -lt 20; $i++) {
  foreach ($w in (New-Object -ComObject Shell.Application).Windows()) {
    try { $path = $w.Document.Folder.Self.Path } catch { continue }
    if ($path -and $path.TrimEnd('\\') -ieq $want) {
      $h = [IntPtr]$w.HWND
      if ([PlotterFront]::IsIconic($h)) { [void][PlotterFront]::ShowWindow($h, 9) }
      [PlotterFront]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
      [PlotterFront]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
      [void][PlotterFront]::SetForegroundWindow($h)
      exit 0
    }
  }
  Start-Sleep -Milliseconds 150
}
`

/** Opens File Explorer with the file selected (explorer /select), then brings that window to the front. */
export function showInExplorer(file: string): void {
  const explorer = spawn('explorer.exe', [`/select,"${file.replace(/"/g, '')}"`], { windowsVerbatimArguments: true, detached: true, stdio: 'ignore' })
  explorer.on('error', () => undefined)
  explorer.unref()
  bringExplorerForward(file)
}

function bringExplorerForward(file: string): void {
  if (process.platform !== 'win32') return
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    env: { ...process.env, PLOTTER_FOLDER: dirname(file) },
    windowsHide: true,
    stdio: 'ignore'
  })
  ps.on('error', () => undefined)
  ps.unref()
}
