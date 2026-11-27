# web

## Request

```mycel
pub struct Request
```

#### json

```mycel
fn json() -> Result<js.Json, Error>
```

## text

```mycel
pub fn text(body: String, status: Int = 200) -> http.Response
```

## html

```mycel
pub fn html(body: String, status: Int = 200) -> http.Response
```

## json

```mycel
pub fn json(value: Any, status: Int = 200) -> http.Response
```

## redirect

```mycel
pub fn redirect(to: String) -> http.Response
```

## escape

```mycel
pub fn escape(text: String) -> String
```

Make text safe to put inside HTML (like Python's html.escape): & < > " ' become entities.

## notFound

```mycel
pub fn notFound(message: String = "not found") -> http.Response
```

## App

```mycel
pub class App
```

#### get

```mycel
fn get(path: String, handler: (Request) -> http.Response)
```

#### post

```mycel
fn post(path: String, handler: (Request) -> http.Response)
```

#### put

```mycel
fn put(path: String, handler: (Request) -> http.Response)
```

#### delete

```mycel
fn delete(path: String, handler: (Request) -> http.Response)
```

#### files

```mycel
fn files(prefix: String, folder: String)
```

Serve the files in `folder` under the URL `prefix` (e.g. files("/static", "public")); needs --allow-read.

#### handle

```mycel
fn handle(req: http.Request) -> http.Response
```

#### start

```mycel
async fn start(port: Int = 0) -> Result<http.Server, Error>
```

Start serving and return the server (port 0 picks a free port) — for tests and programs that keep going.

#### run

```mycel
fn run(port: Int = 8000)
```

Serve on 127.0.0.1:port until the program is stopped (Ctrl-C), like Flask's app.run().
