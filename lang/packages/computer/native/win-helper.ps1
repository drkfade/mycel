# Long-lived Windows helper speaking JSON lines on stdin/stdout.
# Zero extra installs: uses Add-Type user32.dll + System.Windows.Forms + System.Drawing.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class MycelWin {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }

  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public INPUTUNION u;
  }

  [StructLayout(LayoutKind.Explicit)]
  public struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }

  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int nIndex);

  const uint INPUT_MOUSE = 0;
  const uint INPUT_KEYBOARD = 1;
  const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  const uint MOUSEEVENTF_LEFTUP = 0x0004;
  const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  const uint MOUSEEVENTF_WHEEL = 0x0800;
  const uint MOUSEEVENTF_HWHEEL = 0x1000;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;

  static void MouseBtnFlags(string button, out uint down, out uint up) {
    if (button == "right") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; }
    else if (button == "middle") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; }
    else { down = MOUSEEVENTF_LEFTDOWN; up = MOUSEEVENTF_LEFTUP; }
  }

  public static void MouseClick(string button, int count) {
    uint down, up; MouseBtnFlags(button, out down, out up);
    for (int i = 0; i < count; i++) {
      var inputs = new INPUT[2];
      inputs[0].type = INPUT_MOUSE; inputs[0].u.mi.dwFlags = down;
      inputs[1].type = INPUT_MOUSE; inputs[1].u.mi.dwFlags = up;
      SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
  }

  public static void MouseScroll(int dx, int dy) {
    if (dy != 0) {
      var inp = new INPUT[1]; inp[0].type = INPUT_MOUSE; inp[0].u.mi.dwFlags = MOUSEEVENTF_WHEEL; inp[0].u.mi.mouseData = (uint)(dy * 120);
      SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }
    if (dx != 0) {
      var inp = new INPUT[1]; inp[0].type = INPUT_MOUSE; inp[0].u.mi.dwFlags = MOUSEEVENTF_HWHEEL; inp[0].u.mi.mouseData = (uint)(dx * 120);
      SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }
  }

  public static void MouseDrag(int fromX, int fromY, int toX, int toY, string button) {
    uint down, up; MouseBtnFlags(button, out down, out up);
    SetCursorPos(fromX, fromY);
    var d = new INPUT[1]; d[0].type = INPUT_MOUSE; d[0].u.mi.dwFlags = down;
    SendInput(1, d, Marshal.SizeOf(typeof(INPUT)));
    SetCursorPos(toX, toY);
    var u = new INPUT[1]; u[0].type = INPUT_MOUSE; u[0].u.mi.dwFlags = up;
    SendInput(1, u, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void SendUnicodeText(string text) {
    foreach (char ch in text) {
      var inputs = new INPUT[2];
      inputs[0].type = INPUT_KEYBOARD; inputs[0].u.ki.wScan = (ushort)ch; inputs[0].u.ki.dwFlags = KEYEVENTF_UNICODE;
      inputs[1].type = INPUT_KEYBOARD; inputs[1].u.ki.wScan = (ushort)ch; inputs[1].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
      SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
    }
  }

  public static void KeyTap(ushort vk) {
    var inputs = new INPUT[2];
    inputs[0].type = INPUT_KEYBOARD; inputs[0].u.ki.wVk = vk;
    inputs[1].type = INPUT_KEYBOARD; inputs[1].u.ki.wVk = vk; inputs[1].u.ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void SendHotkey(int[] vks) {
    var list = new INPUT[vks.Length * 2];
    for (int i = 0; i < vks.Length; i++) {
      list[i].type = INPUT_KEYBOARD; list[i].u.ki.wVk = (ushort)vks[i];
    }
    for (int i = 0; i < vks.Length; i++) {
      int j = vks.Length + i;
      list[j].type = INPUT_KEYBOARD; list[j].u.ki.wVk = (ushort)vks[vks.Length - 1 - i]; list[j].u.ki.dwFlags = KEYEVENTF_KEYUP;
    }
    SendInput((uint)list.Length, list, Marshal.SizeOf(typeof(INPUT)));
  }

  public static double GetIdleSeconds() {
    var lii = new LASTINPUTINFO(); lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref lii)) return 0.0;
    return ((uint)Environment.TickCount - lii.dwTime) / 1000.0;
  }
}
"@

$script:escHeldSince = [long]0
function Check-PanicKey {
  $down = (([MycelWin]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0)
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($down) {
    if ($script:escHeldSince -eq 0) { $script:escHeldSince = $now }
    if (($now - $script:escHeldSince) -ge 1000) { return $true }
  } else {
    $script:escHeldSince = [long]0
  }
  return $false
}

while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $req = $line | ConvertFrom-Json
  $op = [string]$req.op
  $a = $req.args
  $panic = Check-PanicKey
  try {
    $val = $null
    switch ($op) {
      "ping" { $val = $true }
      "panic.check" { $val = @{ escDown = ($script:escHeldSince -gt 0); triggered = $panic } }
      "mouse.position" { $pt = New-Object MycelWin+POINT; [MycelWin]::GetCursorPos([ref]$pt) | Out-Null; $val = @{ x = $pt.X; y = $pt.Y } }
      "mouse.moveTo" { [MycelWin]::SetCursorPos([int]$a.x, [int]$a.y) | Out-Null }
      "mouse.click" { [MycelWin]::MouseClick([string]$a.button, 1) }
      "mouse.doubleClick" { [MycelWin]::MouseClick([string]$a.button, 2) }
      "mouse.scroll" { [MycelWin]::MouseScroll([int]$a.dx, [int]$a.dy) }
      "mouse.drag" { [MycelWin]::MouseDrag([int]$a.fromX, [int]$a.fromY, [int]$a.toX, [int]$a.toY, [string]$a.button) }
      "keyboard.typeText" { [MycelWin]::SendUnicodeText([string]$a.text) }
      "keyboard.press" { [MycelWin]::KeyTap([uint16]$a.vk) }
      "keyboard.hotkey" { [MycelWin]::SendHotkey([int[]]$a.vks) }
      "keyboard.isDown" { $val = (([MycelWin]::GetAsyncKeyState([int]$a.vk) -band 0x8000) -ne 0) }
      "screen.size" { $val = @{ width = [MycelWin]::GetSystemMetrics(0); height = [MycelWin]::GetSystemMetrics(1) } }
      "screen.screenshot" {
        $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
        $bmp.Save([string]$a.outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose(); $bmp.Dispose()
      }
      "screen.pixel" {
        $bmp = New-Object System.Drawing.Bitmap(1, 1)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen([int]$a.x, [int]$a.y, 0, 0, (New-Object System.Drawing.Size(1, 1)))
        $c = $bmp.GetPixel(0, 0)
        $g.Dispose(); $bmp.Dispose()
        $val = @{ r = [int]$c.R; g = [int]$c.G; b = [int]$c.B; a = [int]$c.A }
      }
      "clipboard.get" { $val = [System.Windows.Forms.Clipboard]::GetText() }
      "clipboard.set" { [System.Windows.Forms.Clipboard]::SetText([string]$a.text) }
      "apps.running" { $val = @(Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty ProcessName -Unique) }
      "apps.quit" { Get-Process -Name ([string]$a.name) -ErrorAction Stop | ForEach-Object { $_.CloseMainWindow() | Out-Null } }
      "notify.show" {
        $n = New-Object System.Windows.Forms.NotifyIcon
        $n.Icon = [System.Drawing.SystemIcons]::Information
        $n.Visible = $true
        $n.ShowBalloonTip(3000, [string]$a.title, [string]$a.message, [System.Windows.Forms.ToolTipIcon]::Info)
      }
      "system.idle" { $val = [MycelWin]::GetIdleSeconds() }
      default { throw "unknown op: $op" }
    }
    $out = @{ id = $req.id; ok = $true; panic = $panic; value = $val } | ConvertTo-Json -Compress -Depth 6
    [Console]::Out.WriteLine($out)
    [Console]::Out.Flush()
  } catch {
    $out = @{ id = $req.id; ok = $false; panic = $panic; error = @{ type = "Error"; message = $_.Exception.Message } } | ConvertTo-Json -Compress -Depth 4
    [Console]::Out.WriteLine($out)
    [Console]::Out.Flush()
  }
}
