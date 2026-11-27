# json

## Json

A JSON value. Where a Json is expected, literals are JSON by themselves: `let v: json.Json = {"a": [1, true, nil]}`.

```ply
enum Json { Null, Bool(Bool), Num(Float), Str(String), Arr([Json]), Obj({String: Json}) }
```

#### get isNull

```ply
get isNull: Bool
```

#### get asString

```ply
get asString: String?
```

#### get asFloat

```ply
get asFloat: Float?
```

#### get asInt

```ply
get asInt: Int?
```

#### get asBool

```ply
get asBool: Bool?
```

#### get asArray

```ply
get asArray: [Json]?
```

#### get asObject

```ply
get asObject:
```

#### get

```ply
fn get(key: String) -> Json?
```

Member of an object, or nil when this is not an object or the key is missing.

#### at

```ply
fn at(index: Int) -> Json?
```

Element of an array, or nil when out of range or not an array.

#### stringify

```ply
fn stringify() -> String
```

## parse

```ply
pub extern fn parse(text: String) -> Result<Json, Error>
```

Parse JSON text. Numbers are Floats; integers up to 2^53 round-trip exactly.

## stringify

```ply
pub extern fn stringify(value: Json) -> String
```

Compact JSON text for a Json value.

## pretty

```ply
pub extern fn pretty(value: Json) -> String
```

Indented JSON text for a Json value.

## encode

```ply
pub extern fn encode(value: Any) -> String
```

JSON text for any plain value: numbers, strings, arrays, maps with String keys, structs and classes (their fields), enums.
