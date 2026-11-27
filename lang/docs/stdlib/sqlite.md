# sqlite

## Db

```ply
pub extern class Db
```

#### open

```ply
static fn open(path: String) -> Result<Db, Error>
```

#### exec

```ply
fn exec(sql: String, params: [Any] = []) -> Result<Void, Error>
```

Run statements that return no rows. Parameters bind to `?` placeholders.

#### query

```ply
fn query(sql: String, params: [Any] = []) -> Result<[{String: Any}], Error>
```

Run a query; each row is a map from column name to Int, Float, String or nil.

#### close

```ply
fn close()
```
