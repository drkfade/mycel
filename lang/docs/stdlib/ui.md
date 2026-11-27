# ui

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
