const assert = require('node:assert/strict');
const { runSource, handleUiEvent } = require('../../dist/src/browser.js');
require('./renderer.js');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; }
  appendChild(el) { this.children.push(el); }
  replaceChildren() { this.children = []; }
}
const document = { createElement: tag => new Element(tag) };
(async () => {
  let render;
  const result = await runSource(`import std.ui
import words
let label = ui.text(words.message())
fn change() { label.setText("clicked") }
ui.window("Demo", [label, ui.button("Go", change)])`, {
    files: { words: 'pub fn message() -> String { return "ready" }' },
    onUi: m => { if (m.type === 'ui:render') render = m.root; }
  });
  assert.equal(result.ok, true, result.diagnosticsText || result.error?.human);
  const mount = new Element('mount');
  const renderer = MycelUI.createRenderer(document, (id, event, value) => {
    const tree = handleUiEvent({ id, event, value });
    if (tree) renderer.render(mount, tree);
  });
  renderer.render(mount, render);
  const body = mount.children[0].children[1];
  const column = body.children[0];
  assert.equal(column.children[0].textContent, 'ready');
  column.children[1].onclick();
  assert.equal(mount.children[0].children[1].children[0].children[0].textContent, 'clicked');
  const bad = await runSource('import words', { files: { words: 'print("no")' } });
  assert.equal(bad.ok, false);
  assert.match(bad.diagnosticsText, /top-level statements/);
  console.log('browser sibling imports and DOM event round trip passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
