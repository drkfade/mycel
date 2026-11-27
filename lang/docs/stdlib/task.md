# task

## sleep

```ply
pub extern async fn sleep(ms: Int)
```

## all

```ply
pub extern async fn all<T>(tasks: [Task<T>]) -> [T]
```

## race

```ply
pub extern async fn race<T>(tasks: [Task<T>]) -> T
```

The first task to finish. To wait on channels, use `select`: racing `recv()` calls loses a value.

## timeout

```ply
pub extern async fn timeout<T>(ms: Int, task: Task<T>) -> Result<T, Error>
```

## select

```ply
pub extern async fn select<T>(channels: [Channel<T>]) -> (Int, T?)
pub extern async fn select<T>(channels: [Channel<T>], timeout: Int) -> (Int, T?)?
```

Wait on several channels at once (Go's select): gives (which, value) for the first channel with a value; the value is
nil when that channel is closed. The other channels keep their values (race over recv() calls would lose one).
With `timeout:` it gives nil when nothing arrives within that many milliseconds.

## Channel

```ply
pub extern class Channel<T>
```

An unbounded multi-producer queue. `recv` waits for a value and gives nil once the channel is closed and drained.

#### init

```ply
init()
```

#### get length

```ply
get length: Int
```

#### get isClosed

```ply
get isClosed: Bool
```

#### send

```ply
fn send(value: T)
```

#### close

```ply
fn close()
```

#### recv

```ply
async fn recv() -> T?
```
