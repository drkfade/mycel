# process

## Output

```ply
pub struct Output
```

#### get ok

```ply
get ok: Bool
```

## run

```ply
pub extern fn run(command: String, args: [String] = [], input: String = "", timeoutMs: Int = 30000) -> Result<Output, Error>
```

Run a program without a shell. Needs `capabilities.process.run` listing the executable (or true).

## pid

```ply
pub extern fn pid() -> Int
```
