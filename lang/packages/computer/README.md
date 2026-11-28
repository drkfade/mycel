# `computer` — Computer Control for Mycel

Beginner-first desktop automation, screen inspection, clipboard, apps, notifications, and system info as an installable Mycel package.

## Install

```sh
ply install computer
```

Import the modules you need:

```mycel
import computer.{mouse, keyboard}
# or individually:
import computer.mouse
import computer.screen
import computer.clipboard
import computer.apps
import computer.notify
import computer.system
```

> Note: `from computer import mouse, keyboard` is the upcoming selective-import syntax; use `import computer.{mouse, keyboard}` until then.

## Permissions & Safety (Required)

Nothing works by default. Every module is capability-gated — denied calls return `Err(CapabilityError)` telling you the exact flag or `ply.json` setting to add:

| Modules | CLI Flag | `ply.json` `"capabilities"` |
|---|---|---|
| `mouse`, `keyboard`, `apps`, `notify`, `system` | `--allow-control` | `"control": true` |
| `screen` (`size`, `screenshot`, `pixel`) | `--allow-screen` | `"screen": true` |
| `screen.Image.save(path)` | `--allow-screen --allow-write` | `"screen": true, "fs": { "write": ["."] }` |
| `clipboard` (`get`, `set`) | `--allow-clipboard` | `"clipboard": true` |

### Safety Notice & Panic Key

Whenever a running program controls mouse or keyboard input:
1. It prints a visible safety notice: `[computer] safety: program is controlling input — hold Escape for 1s to abort`.
2. Holding **Escape for 1 second** triggers the panic key and aborts the program.

### macOS Permissions

- **Accessibility** (required for `mouse` movement/clicks/scroll/drag and `keyboard` typing/press/hotkey):  
  If missing, `computer` returns an error directing you to **System Settings -> Privacy & Security -> Accessibility**.
- **Screen Recording** (required for `screen.screenshot()` and `screen.pixel(x, y)`):  
  If missing, `computer` returns an error directing you to **System Settings -> Privacy & Security -> Screen Recording**.

### Platforms & Backends

- **macOS**: Long-lived `osascript -l JavaScript` (JXA CoreGraphics / AppKit / ApplicationServices) + `screencapture -x`, `open -g` (background, never steals focus), `pmset -g batt`. Zero extra installs.
- **Windows**: Long-lived PowerShell + `Add-Type user32.dll` (`SendInput`, `GetCursorPos`, `SetCursorPos`, `GetAsyncKeyState`, `GetLastInputInfo`) / `System.Windows.Forms` / `System.Drawing`. Zero extra installs.
- **Linux**: Planned (dry-run and mock backends work today).
- **Safe Testing**: Set `MYCEL_COMPUTER_BACKEND=dry-run` (prints OS calls without executing them) or `MYCEL_COMPUTER_BACKEND=mock` (in-memory virtual device).

## API

### `computer.mouse`
- `position() -> Result<Point, Error>` (`Point { x: Int, y: Int }`)
- `moveTo(x: Int, y: Int) -> Result<Void, Error>`
- `click(button: String = "left") -> Result<Void, Error>` (`"left"`, `"right"`, `"middle"`)
- `doubleClick(button: String = "left") -> Result<Void, Error>`
- `scroll(dx: Int = 0, dy: Int = 0) -> Result<Void, Error>`
- `drag(fromX: Int, fromY: Int, toX: Int, toY: Int, button: String = "left") -> Result<Void, Error>`

### `computer.keyboard`
- `typeText(text: String) -> Result<Void, Error>` (`typeText` because `type` is a Mycel keyword)
- `press(key: String) -> Result<Void, Error>` (e.g. `"Enter"`, `"Tab"`, `"Escape"`, `"Space"`, `"a"`, `"F5"`)
- `hotkey(...keys: String) -> Result<Void, Error>` (e.g. `keyboard.hotkey("cmd", "c")`)
- `isDown(key: String) -> Result<Bool, Error>`

### `computer.screen`
- `size() -> Result<Size, Error>` (`Size { width: Int, height: Int }`)
- `screenshot() -> Result<Image, Error>` (`Image { width: Int, height: Int, save(path), pixel(x, y) }`)
- `pixel(x: Int, y: Int) -> Result<Color, Error>` (`Color { r: Int, g: Int, b: Int, a: Int, hex() }`)

### `computer.clipboard`
- `get() -> Result<String, Error>`
- `set(text: String) -> Result<Void, Error>`

### `computer.apps`
- `open(name: String) -> Result<Void, Error>` (uses `open -g -a` on macOS so it never steals focus)
- `openFile(path: String) -> Result<Void, Error>`
- `openUrl(url: String) -> Result<Void, Error>` (`http://` and `https://` only)
- `running() -> Result<[String], Error>`
- `quit(name: String) -> Result<Void, Error>` (graceful quit, never force-kill)

### `computer.notify`
- `show(title: String, message: String) -> Result<Void, Error>`

### `computer.system`
- `os() -> Result<String, Error>` (`"macos"`, `"windows"`, `"linux"`)
- `user() -> Result<String, Error>`
- `battery() -> Result<Battery, Error>` (`Battery { percent: Int?, charging: Bool }`)
- `idle() -> Result<Float, Error>` (seconds since last input event)
