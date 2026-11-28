# ui

`std.ui` displays a window in the Mycel playground. A normal `mycel run` has
no native window renderer yet; it prints a notice instead. Run a browser-safe UI
from a source checkout with `mycel web main.myc` (or `mycel web .` inside a project), then visit the
printed loopback URL. It reloads when source files change and displays compiler
errors. It does not open a browser for you. Programs run in the browser sandbox:
file, network, server-side `std.web`, SQLite and foreign-package access are not
available there. Packaged releases do not yet include the browser assets. Canvas, keyboard and game-loop APIs are not available in
`std.ui` yet.

In the playground, select **Add file** to create a sibling such as `words.myc`,
then write `import words` in `main.myc`. The Run button always starts `main.myc`.
Share links include all files. Imported declarations need `pub`.

```mycel
# words.myc
pub fn greeting() -> String { return "Hello!" }
```

```mycel
# main.myc
import std.ui
import words
ui.window("Greeting", [ui.text(words.greeting())])
```

The renderer builds DOM nodes from the tree and sends button and input events
back to the running program. Window construction mounts it immediately.

## Element

```mycel
pub class Element
```

#### setText

```mycel
fn setText(newText: String)
```

#### value

```mycel
fn value() -> String
```

#### setValue

```mycel
fn setValue(newValue: String)
```

#### setItems

```mycel
fn setItems(items: [Element])
```

#### append

```mycel
fn append(child: Element)
```

#### removeAt

```mycel
fn removeAt(index: Int)
```

## Window

```mycel
pub class Window
```

#### setContent

```mycel
fn setContent(content: Element)
```

#### setTitle

```mycel
fn setTitle(newTitle: String)
```

#### show

```mycel
fn show()
```

#### close

```mycel
fn close()
```

## text

```mycel
pub fn text(content: String = "") -> Element
```

## button

```mycel
pub fn button(label: String, onClick: (() -> Void)? = nil) -> Element
```

## input

```mycel
pub fn input(value: String = "", placeholder: String = "", onInput: ((String) -> Void)? = nil, onChange: ((String) -> Void)? = nil) -> Element
```

## image

```mycel
pub fn image(src: String, alt: String = "") -> Element
```

## list

```mycel
pub fn list(children: [Element] = []) -> Element
```

## row

```mycel
pub fn row(children: [Element] = []) -> Element
```

## column

```mycel
pub fn column(children: [Element] = []) -> Element
```

## window

```mycel
pub fn window(title: String, children: [Element]) -> Window
```

## window

```mycel
pub fn window(title: String, content: Element) -> Window
```

## window

```mycel
pub fn window(title: String) -> Window
```
