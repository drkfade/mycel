# foreign

## Value

```mycel
pub extern class Value: Printable
```

A value that came from a Python or npm package.

#### get runtime

```mycel
get runtime: String
```

"python" or "npm"

#### get typeName

```mycel
get typeName: String
```

The value's type in its own language: "int", "str", "dict", "Response", "function", ...

#### get isNone

```mycel
get isNone: Bool
```

None (Python) / null or undefined (JavaScript)

#### get asString

```mycel
get asString: String?
```

#### get asInt

```mycel
get asInt: Int?
```

Whole numbers only (a Python int, a JavaScript integer number or BigInt).

#### get asFloat

```mycel
get asFloat: Float?
```

Any number.

#### get asBool

```mycel
get asBool: Bool?
```

#### get asList

```mycel
get asList: [Value]?
```

A list/tuple/array, element by element.

#### get asMap

```mycel
get asMap:
```

A dict/object with String keys.

#### get keys

```mycel
get keys: [String]
```

Keys of a dict/object; [] for anything else.

#### get length

```mycel
get length: Int
```

Elements of a list or entries of a dict; 0 for anything else.

#### []

```mycel
operator [](key: String) -> Value
```

`data["name"]` on copied data: the member, or a None Value when missing.

#### []

```mycel
operator [](index: Int) -> Value
```

`items[0]` on copied data (negative counts from the end): the element, or a None Value when out of range.

#### attr

```mycel
fn attr(name: String) -> Result<Value, Error>
```

An attribute / property: `r.attr("status_code")`.

#### call

```mycel
fn call(method: String, ...args: Any) -> Result<Value, Error>
```

Call a method: `session.call("get", url)`.

#### callKw

```mycel
fn callKw(method: String, args: [Any], named: {String: Any}) -> Result<Value, Error>
```

Call a method with named arguments (Python keyword arguments): `r.callKw("json", [], {"strict": false})`.

#### invoke

```mycel
fn invoke(...args: Any) -> Result<Value, Error>
```

Call the value itself (a function or class that was returned to you).

#### item

```mycel
fn item(key: Any) -> Result<Value, Error>
```

Python `obj[key]` / JavaScript `obj[key]` on a handle (a pandas frame, a Map, ...).

#### toString

```mycel
fn toString() -> String
```

Python str(value) / JavaScript String(value).

## unset

```mycel
pub extern fn unset() -> Any
```

The "not given" default of an optional parameter in generated bindings (the argument is left out of the call).

## resolve

```mycel
pub extern async fn resolve(value: Value) -> Result<Value, Error>
```

Wait for a JavaScript Promise held in a Value (an async npm function); anything else is returned as it is.

## callModule

```mycel
pub extern fn callModule(runtime: String, package: String, module: String, attr: String, values: [Any], names: [String], named: {String: Any}, rest: [Any], hasRest: Bool) -> Result<Value, Error>
```

Used by generated bindings: call `attr` of module `module` of a runtime. `names[i]` describes `values[i]`
("x" positional-or-named, "/x" positional only, "*x" named only); `rest` holds extra positional arguments.
