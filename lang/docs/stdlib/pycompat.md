# pycompat

## ValueError

```mycel
pub class ValueError: Error
```

Python's ValueError: raised by int("x7") and float("abc"), so `except ValueError:` translates to a catch.

## str

```mycel
pub extern fn str(value: Any) -> String
```

Python's str(value): True/False/None, 'quoted' strings inside lists/dicts/tuples, {1, 2} sets, 2.0 floats.

## repr

```mycel
pub extern fn repr(value: Any) -> String
```

Python's repr(value): like str, and a String itself is quoted.

## int

```mycel
pub extern fn int(value: Any) -> Int
```

Python's int(value): a String is parsed (ValueError when it is not a whole number), a Float is truncated.

## float

```mycel
pub extern fn float(value: Any) -> Float
```

Python's float(value): a String is parsed (ValueError when it is not a number), an Int converted.

## truthy

```mycel
pub extern fn truthy(value: Any) -> Bool
```

Python's truth test: 0, 0.0, "", nil, empty collections and false are false.

## floordiv

```mycel
pub extern fn floordiv(a: Int, b: Int) -> Int
```

Python's a // b on Ints (rounds down: -7 // 2 == -4).

## floordiv

```mycel
pub extern fn floordiv(a: Float, b: Float) -> Float
```

Python's a // b on Floats.

## mod

```mycel
pub extern fn mod(a: Int, b: Int) -> Int
```

Python's a % b on Ints (the sign of b: -7 % 3 == 2).

## mod

```mycel
pub extern fn mod(a: Float, b: Float) -> Float
```

Python's a % b on Floats.

## round

```mycel
pub extern fn round(x: Float) -> Int
```

Python's round(x): halves go to the even neighbour (round(2.5) == 2).

## round

```mycel
pub extern fn round(x: Float, digits: Int) -> Float
```

Python's round(x, digits).

## slice

```mycel
pub extern fn slice<T>(xs: [T], lo: Int?, hi: Int?) -> [T]
```

Python's xs[lo:hi]: negative bounds count from the end, nil is open, and bounds past the end are clamped.

## slice

```mycel
pub extern fn slice(s: String, lo: Int?, hi: Int?) -> String
```

Python's s[lo:hi] on a String.

## sorted

```mycel
pub extern fn sorted<T>(xs: [T]) -> [T]
```

Python's sorted(xs): tuples and lists compare item by item, Int and Float compare as numbers.

## sortedBy

```mycel
pub extern fn sortedBy<T, K>(xs: [T], key: (T) -> K) -> [T]
```

Python's sorted(xs, key=f) where the key may be a tuple: sorted(items, key=lambda kv: (-kv[1], kv[0])).

## maxBy

```mycel
pub extern fn maxBy<T, K>(xs: [T], key: (T) -> K) -> T
```

Python's max(xs, key=f): the first item with the largest key.

## minBy

```mycel
pub extern fn minBy<T, K>(xs: [T], key: (T) -> K) -> T
```

Python's min(xs, key=f): the first item with the smallest key.

## concat

```mycel
pub fn concat<T>(a: [T], b: [T]) -> [T]
```

Python's list + list.

## repeat

```mycel
pub fn repeat<T>(a: [T], n: Int) -> [T]
```

Python's list * n.
