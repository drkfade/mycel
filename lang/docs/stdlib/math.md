# math

## PI

```ply
pub let PI = 3.141592653589793
```

## E

```ply
pub let E = 2.718281828459045
```

## sin

```ply
pub extern fn sin(x: Float) -> Float
```

## cos

```ply
pub extern fn cos(x: Float) -> Float
```

## tan

```ply
pub extern fn tan(x: Float) -> Float
```

## asin

```ply
pub extern fn asin(x: Float) -> Float
```

## acos

```ply
pub extern fn acos(x: Float) -> Float
```

## atan

```ply
pub extern fn atan(x: Float) -> Float
```

## atan2

```ply
pub extern fn atan2(y: Float, x: Float) -> Float
```

## exp

```ply
pub extern fn exp(x: Float) -> Float
```

## log

```ply
pub extern fn log(x: Float) -> Float
```

## log2

```ply
pub extern fn log2(x: Float) -> Float
```

## log10

```ply
pub extern fn log10(x: Float) -> Float
```

## sqrt

```ply
pub extern fn sqrt(x: Float) -> Float
```

## pow

```ply
pub extern fn pow(x: Float, y: Float) -> Float
```

## random

```ply
pub extern fn random() -> Float
```

A uniformly random Float in [0, 1). Not for cryptography (see crypto).

## randomInt

```ply
pub extern fn randomInt(lo: Int, hi: Int) -> Int
```

A random Int in [lo, hi).

## hypot

```ply
pub fn hypot(a: Float, b: Float) -> Float
```

## gcd

```ply
pub fn gcd(a: Int, b: Int) -> Int
```

## radians

```ply
pub fn radians(degrees: Float) -> Float
```

## degrees

```ply
pub fn degrees(radians: Float) -> Float
```
