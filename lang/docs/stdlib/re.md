# re

## Match

```ply
pub struct Match
```

## Regex

```ply
pub extern class Regex
```

#### compile

```ply
static fn compile(pattern: String, flags: String = "") -> Result<Regex, Error>
```

#### isMatch

```ply
fn isMatch(text: String) -> Bool
```

#### find

```ply
fn find(text: String) -> Match?
```

#### findAll

```ply
fn findAll(text: String) -> [Match]
```

#### replace

```ply
fn replace(text: String, with: String) -> String
```

#### split

```ply
fn split(text: String) -> [String]
```
