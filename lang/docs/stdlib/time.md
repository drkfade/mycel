# time

## nowMs

```mycel
pub extern fn nowMs() -> Int
```

Milliseconds since 1970-01-01 UTC.

## now

```mycel
pub fn now() -> Float
```

Seconds since 1970-01-01 UTC, with fractions.

## monotonicMs

```mycel
pub extern fn monotonicMs() -> Float
```

A monotonic clock in milliseconds, for measuring durations.

## iso

```mycel
pub extern fn iso(ms: Int) -> String
```

ISO-8601 UTC text for a timestamp in milliseconds, e.g. 2026-11-01T12:00:00.000Z.

## parseIso

```mycel
pub extern fn parseIso(text: String) -> Int?
```

## Parts

```mycel
pub struct Parts
```

year, month (1-12), day, hour, minute, second, weekday (0 = Sunday) in UTC.

## parts

```mycel
pub extern fn parts(ms: Int) -> Parts
```

## today

```mycel
pub fn today() -> String
```

Current UTC date as "YYYY-MM-DD", like Python's date.today().

## sleep

```mycel
pub async fn sleep(seconds: Float)
```

Pause execution for the given seconds, like Python's time.sleep().

## sleep

```mycel
pub async fn sleep(seconds: Int)
```

## Duration

```mycel
pub struct Duration
```

A duration of time, like Python's datetime.timedelta.

#### toSeconds

```mycel
fn toSeconds() -> Float
```

#### toMs

```mycel
fn toMs() -> Int
```

#### toMinutes

```mycel
fn toMinutes() -> Float
```

#### toHours

```mycel
fn toHours() -> Float
```

#### toDays

```mycel
fn toDays() -> Float
```

## milliseconds

```mycel
pub fn milliseconds(n: Int) -> Duration
```

## seconds

```mycel
pub fn seconds(n: Float) -> Duration
```

## seconds

```mycel
pub fn seconds(n: Int) -> Duration
```

## minutes

```mycel
pub fn minutes(n: Float) -> Duration
```

## minutes

```mycel
pub fn minutes(n: Int) -> Duration
```

## hours

```mycel
pub fn hours(n: Float) -> Duration
```

## hours

```mycel
pub fn hours(n: Int) -> Duration
```

## days

```mycel
pub fn days(n: Float) -> Duration
```

## days

```mycel
pub fn days(n: Int) -> Duration
```

## format

```mycel
pub fn format(ms: Int, formatStr: String) -> String
```

Format a millisecond timestamp using Python-style format tokens: %Y, %m, %d, %H, %M, %S, %F, %T.

## format

```mycel
pub fn format(formatStr: String = "%Y-%m-%d %H:%M:%S") -> String
```

Format the current time with the given format string (defaults to "%Y-%m-%d %H:%M:%S").
