# test

## assertEq

```ply
pub extern fn assertEq(actual: Any, expected: Any, message: String = "")
```

## assertNe

```ply
pub extern fn assertNe(actual: Any, unexpected: Any, message: String = "")
```

## assertTrue

```ply
pub fn assertTrue(condition: Bool, message: String = "expected true")
```

## assertFalse

```ply
pub fn assertFalse(condition: Bool, message: String = "expected false")
```

## fail

```ply
pub fn fail(message: String) -> Never
```
