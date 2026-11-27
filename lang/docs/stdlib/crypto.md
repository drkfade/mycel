# crypto

## sha256

```ply
pub extern fn sha256(text: String) -> String
```

## sha1

```ply
pub extern fn sha1(text: String) -> String
```

## hmacSha256

```ply
pub extern fn hmacSha256(key: String, text: String) -> String
```

## randomHex

```ply
pub extern fn randomHex(n: Int) -> String
```

n random bytes as hex, from the operating system's CSPRNG.

## uuid

```ply
pub extern fn uuid() -> String
```

## base64Encode

```ply
pub extern fn base64Encode(text: String) -> String
```

## base64Decode

```ply
pub extern fn base64Decode(text: String) -> Result<String, Error>
```

## hexEncode

```ply
pub extern fn hexEncode(text: String) -> String
```
