# fs

## readText

```ply
pub extern fn readText(path: String) -> Result<String, Error>
```

## writeText

```ply
pub extern fn writeText(path: String, text: String) -> Result<Void, Error>
```

## appendText

```ply
pub extern fn appendText(path: String, text: String) -> Result<Void, Error>
```

## exists

```ply
pub extern fn exists(path: String) -> Result<Bool, Error>
```

## isDir

```ply
pub extern fn isDir(path: String) -> Result<Bool, Error>
```

## list

```ply
pub extern fn list(path: String) -> Result<[String], Error>
```

## mkdirs

```ply
pub extern fn mkdirs(path: String) -> Result<Void, Error>
```

## remove

```ply
pub extern fn remove(path: String) -> Result<Void, Error>
```

## size

```ply
pub extern fn size(path: String) -> Result<Int, Error>
```

## join

```ply
pub extern fn join(a: String, b: String) -> String
```

## extension

```ply
pub fn extension(path: String) -> String
```

## basename

```ply
pub extern fn basename(path: String) -> String
```

## dirname

```mycel
pub extern fn dirname(path: String) -> String
```

`join`, `basename`, and `dirname` are pure path operations using the host's
separator, drive and UNC rules; they do not read files or need a grant.
`std.files.Path.parent` uses `dirname`. File operations resolve symlinks and
check granted roots before accessing the filesystem. On Windows, file grants
reject device namespaces, alternate data streams and DOS device aliases.
