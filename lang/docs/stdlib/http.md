# http

## Response

```ply
pub struct Response
```

#### get ok

```ply
get ok: Bool
```

#### json

```ply
fn json() -> Result<json.Json, Error>
```

## Request

```ply
pub struct Request
```

#### json

```ply
fn json() -> Result<json.Json, Error>
```

## text

```ply
pub fn text(body: String, status: Int = 200) -> Response
```

## jsonResponse

```ply
pub fn jsonResponse(value: json.Json, status: Int = 200) -> Response
```

## get

```ply
pub extern async fn get(url: String, headers: {String: String} = {}) -> Result<Response, Error>
```

## post

```ply
pub extern async fn post(url: String, body: String, headers: {String: String} = {}) -> Result<Response, Error>
```

## request

```ply
pub extern async fn request(method: String, url: String, body: String = "", headers: {String: String} = {}) -> Result<Response, Error>
```

## Server

```ply
pub extern class Server
```

#### get port

```ply
get port: Int
```

#### stop

```ply
fn stop()
```

## serve

```ply
pub extern async fn serve(port: Int, handler: (Request) -> Response) -> Result<Server, Error>
```

Start a server on 127.0.0.1:port (0 picks a free port; read it from `server.port`).

## serveAsync

```ply
pub extern async fn serveAsync(port: Int, handler: (Request) -> Task<Response>) -> Result<Server, Error>
```
