// Shared DOM renderer for Mycel's ui:render protocol. No HTML from a program is interpreted.
(function (root) {
  function createRenderer(document, send) {
function buildUiNode(node) {
  if (!node) return null;
  switch (node.kind) {
    case "text": {
      const el = document.createElement("div");
      el.className = "mycel-ui-txt";
      el.textContent = node.text || "";
      return el;
    }
    case "button": {
      const el = document.createElement("button");
      el.className = "mycel-ui-btn";
      el.type = "button";
      el.textContent = node.text || "";
      el.onclick = () => send(node.id, "click");
      return el;
    }
    case "input": {
      const el = document.createElement("input");
      el.className = "mycel-ui-inp";
      el.type = "text";
      el.value = node.text || "";
      el.placeholder = node.placeholder || "";
      el.oninput = () => send(node.id, "input", el.value);
      el.onchange = () => send(node.id, "change", el.value);
      return el;
    }
    case "image": {
      const el = document.createElement("img");
      el.className = "mycel-ui-img";
      const s = node.src || "";
      if (/^(https?:|data:image\/|\/)/i.test(s)) el.src = s;
      el.alt = node.alt || "";
      return el;
    }
    case "list": {
      const el = document.createElement("div");
      el.className = "mycel-ui-list";
      for (const child of node.children || []) {
        const item = document.createElement("div");
        item.className = "mycel-ui-list-item";
        const c = buildUiNode(child);
        if (c) item.appendChild(c);
        el.appendChild(item);
      }
      return el;
    }
    case "row": {
      const el = document.createElement("div");
      el.className = "mycel-ui-row";
      for (const child of node.children || []) {
        const c = buildUiNode(child);
        if (c) el.appendChild(c);
      }
      return el;
    }
    case "column": {
      const el = document.createElement("div");
      el.className = "mycel-ui-column";
      for (const child of node.children || []) {
        const c = buildUiNode(child);
        if (c) el.appendChild(c);
      }
      return el;
    }
  }
  return null;
}

function buildUiWindow(win) {
  const container = document.createElement("div");
  container.className = "mycel-ui-win";
  const titleBar = document.createElement("div");
  titleBar.className = "mycel-ui-titlebar";
  const title = document.createElement("span");
  title.textContent = win.title || "Window";
  titleBar.appendChild(title);
  container.appendChild(titleBar);
  const body = document.createElement("div");
  body.className = "mycel-ui-body";
  if (win.content) {
    const c = buildUiNode(win.content);
    if (c) body.appendChild(c);
  }
  container.appendChild(body);
  return container;
}

    return { render(mount, tree) { mount.replaceChildren(); if (tree) mount.appendChild(buildUiWindow(tree)); } };
  }
  root.MycelUI = { createRenderer };
})(typeof globalThis !== "undefined" ? globalThis : self);
