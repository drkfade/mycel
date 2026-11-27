# env

## args

```ply
pub extern fn args() -> [String]
```

Command-line arguments given to the program (always available).

## get

```ply
pub extern fn get(name: String) -> Result<String?, Error>
```

Value of an environment variable; needs a grant (`capabilities.env.read`). Denied or unset gives nil.

## platform

```ply
pub extern fn platform() -> String
```
