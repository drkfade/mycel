# files

## Path

```mycel
pub class Path
```

#### get name

```mycel
get name: String
```

#### get extension

```mycel
get extension: String
```

#### get stem

```mycel
get stem: String
```

#### get parent

```mycel
get parent: Path
```

#### text

```mycel
fn text() -> Result<String, Error>
```

#### write

```mycel
fn write(content: String) -> Result<Void, Error>
```

#### append

```mycel
fn append(content: String) -> Result<Void, Error>
```

#### exists

```mycel
fn exists() -> Bool
```

#### isDir

```mycel
fn isDir() -> Bool
```

#### isFile

```mycel
fn isFile() -> Bool
```

#### size

```mycel
fn size() -> Result<Int, Error>
```

#### list

```mycel
fn list() -> Result<[Path], Error>
```

#### join

```mycel
fn join(part: String) -> Path
```

#### mkdir

```mycel
fn mkdir() -> Result<Void, Error>
```

#### remove

```mycel
fn remove() -> Result<Void, Error>
```

#### toString

```mycel
fn toString() -> String
```

## path

```mycel
pub fn path(p: String) -> Path
```

## read

```mycel
pub fn read(path: String) -> Result<String, Error>
```

## write

```mycel
pub fn write(path: String, content: String) -> Result<Void, Error>
```

## append

```mycel
pub fn append(path: String, content: String) -> Result<Void, Error>
```

## exists

```mycel
pub fn exists(path: String) -> Bool
```

## list

```mycel
pub fn list(path: String = ".") -> Result<[String], Error>
```

## remove

```mycel
pub fn remove(path: String) -> Result<Void, Error>
```

## mkdir

```mycel
pub fn mkdir(path: String) -> Result<Void, Error>
```

## isDir

```mycel
pub fn isDir(path: String) -> Bool
```

## isFile

```mycel
pub fn isFile(path: String) -> Bool
```

## size

```mycel
pub fn size(path: String) -> Result<Int, Error>
```

## lines

```mycel
pub fn lines(path: String) -> Result<[String], Error>
```
