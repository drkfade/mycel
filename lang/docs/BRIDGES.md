# Bridges: using packages from other languages

Mycel uses Python, npm and Java packages (later Rust, Go, Swift) with **Mycel syntax only**.
Every bridge follows this one design so the languages behave the same from Mycel's side.

## What the programmer sees

```mycel
import requests --python                       # installed with: ply install requests --python
import "@google/generative-ai" as genai --npm
import javax.swing.{JFrame} --java             # JDK classes need no install; Maven ones: ply install group:artifact --java

let r = requests.get("https://example.com")    # Mycel syntax, no ; needed, nil not null/None
let frame = JFrame("Hello")
frame.setLocationRelativeTo(nil)
```

- A foreign import **always ends with its runtime flag** (`--python`, `--npm`, `--java`, …). No flag = Mycel.
- The runtime and exact versions come from `ply.json` / `ply.lock`.
- Foreign code runs only with the capability the project grants in `ply.json` (`"capabilities": {"python": true}` or
  narrower); default deny, with an error that shows the exact line to add. Same safety model as files/network.

## One protocol for every runtime

Each runtime runs as **one long-lived helper process per Mycel program** (started on first use, killed when the
program exits), speaking **JSON lines over stdin/stdout**. No sockets, no ports.

Requests from Mycel (one JSON object per line, `id` increasing):

| op | fields | meaning |
|---|---|---|
| `import` | `module`, `names?` | load a module/class; returns a handle |
| `get` | `target`, `name` | attribute / static field / property |
| `set` | `target`, `name`, `value` | assign an attribute / field |
| `call` | `target`, `name?`, `args`, `kwargs?` | call a function or method (`name` omitted = call `target` itself) |
| `new` | `target`, `args`, `kwargs?` | construct (Java `new`, Python class call, JS `new`) |
| `iter` | `target`, `max` | next up to `max` items of an iterable/iterator |
| `release` | `handles` | free handles Mycel no longer references |

Replies: `{"id", "ok": true, "value"}` or `{"id", "ok": false, "error": {"type", "message", "trace"}}`.

Values:
- `nil` ↔ None / null / undefined, `Bool`, `Int` (exact; BigInt-safe as a decimal string when > 2^53), `Float`,
  `String`, `[T]` ↔ list / array / java.util.List, `[String: T]` ↔ dict / plain object / java.util.Map (string keys),
  `Bytes` ↔ bytes / Uint8Array / byte[] (base64).
- Everything else is an **opaque handle** `{"$h": 17, "type": "requests.Response"}`; Mycel wraps it in a typed proxy
  (`Any`-like, members resolved at run time, with did-you-mean from the helper's member list on a wrong name).
- Callbacks (a Mycel closure passed to foreign code, e.g. a Swing ActionListener or a JS callback) are a handle the
  helper calls back with `{"callback": h, "args": [...]}` on stdout; Mycel answers on stdin. Java functional
  interfaces/listeners are implemented with a dynamic proxy.

Errors: a foreign exception becomes a Mycel `Result` error / panic with **the foreign type + message and the last
foreign frame**, plus the Mycel line that made the call: `requests.ConnectionError: … (python) at app.myc:12`.

## Per runtime

| runtime | helper | environment | install source |
|---|---|---|---|
| Python | `python3` + `lang/bridges/python/bridge.py` (stdlib only) | per-project venv `.ply/python` | pip, pinned with hashes in ply.lock |
| npm | Mycel already runs on Node: **in-process** (no helper) | `.ply/node/node_modules` | npm tarballs, integrity in ply.lock |
| Java | `java` (JDK ≥ 17) running `lang/bridges/java/Bridge.java` (JDK only, reflection) | `.ply/java/*.jar` classpath | Maven Central jars + SHA-1/SHA-256 in ply.lock; JDK classes need no install |
| Rust / Go / Swift | later (C ABI / subprocess) | — | — |

Naming: foreign members keep their real names (`setLocationRelativeTo`, `get_json`); Mycel never renames them.
Java overloads are resolved from the runtime argument types (most specific wins; ambiguous → error listing them).
Python kwargs are Mycel named arguments: `requests.get(url, timeout: 5)`.

## Tests every bridge must have
Fixture packages/classes (no network in tests), every value type both ways, handles + release, exceptions with
traces, callbacks, capability deny/allow, helper crash → clear error (not a hang), call overhead measured.
