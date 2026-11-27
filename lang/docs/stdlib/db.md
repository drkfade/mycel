# db

## KV

```mycel
pub class KV
```

#### set

```mycel
fn set(key: String, value: String) -> Result<Void, Error>
```

#### get

```mycel
fn get(key: String, default: String = "") -> String
```

#### getOpt

```mycel
fn getOpt(key: String) -> String?
```

#### has

```mycel
fn has(key: String) -> Bool
```

#### remove

```mycel
fn remove(key: String) -> Result<Void, Error>
```

#### keys

```mycel
fn keys() -> [String]
```

#### count

```mycel
fn count() -> Int
```

#### clear

```mycel
fn clear() -> Result<Void, Error>
```

#### close

```mycel
fn close()
```

## Table

```mycel
pub class Table
```

#### insert

```mycel
fn insert(row: {String: Any}) -> Result<Void, Error>
```

#### all

```mycel
fn all() -> Result<[{String: Any}], Error>
```

#### find

```mycel
fn find(where: {String: Any} = {}) -> Result<[{String: Any}], Error>
```

#### findOne

```mycel
fn findOne(where: {String: Any}) -> Result<{String: Any}?, Error>
```

#### update

```mycel
fn update(where: {String: Any}, values: {String: Any}) -> Result<Void, Error>
```

#### delete

```mycel
fn delete(where: {String: Any} = {}) -> Result<Void, Error>
```

#### count

```mycel
fn count(where: {String: Any} = {}) -> Result<Int, Error>
```

## Database

```mycel
pub class Database
```

#### table

```mycel
fn table(name: String, schema: {String: String} = {}) -> Result<Table, Error>
```

#### exec

```mycel
fn exec(sql: String, params: [Any] = []) -> Result<Void, Error>
```

#### query

```mycel
fn query(sql: String, params: [Any] = []) -> Result<[{String: Any}], Error>
```

#### close

```mycel
fn close()
```

## open

```mycel
pub fn open(path: String = ":memory:") -> Result<Database, Error>
```

## openKV

```mycel
pub fn openKV(path: String = ":memory:") -> Result<KV, Error>
```
