"use strict";
// win32 URI identity, unit-tested on any OS by injecting the platform. Run: node --test lsp/uris.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { makeUris } = require("./uris");

test("win32: VS Code and Node spellings of one file share a key; distinct files do not", () => {
  const u = makeUris("win32");
  const same = ["file:///c%3A/Users/Ana%20B/My%20Code%20%28x%29/main.myc", "file:///C:/Users/Ana%20B/My%20Code%20(x)/main.myc", "file:///c:/users/ana%20b/my%20code%20(x)/MAIN.myc"];
  const keys = same.map(u.keyOf);
  assert.equal(new Set(keys).size, 1, JSON.stringify(keys));
  assert.equal(u.fileOf(same[0]), "c:\\Users\\Ana B\\My Code (x)\\main.myc");
  assert.equal(u.keyOf(same[0]), u.keyOfFile("C:\\Users\\Ana B\\My Code (x)\\main.myc"));
  assert.equal(u.keyOfFile("C:\\a\\.\\b\\..\\main.myc"), u.keyOfFile("c:\\A\\main.myc"));
  assert.notEqual(u.keyOf("file:///C:/a/main.myc"), u.keyOf("file:///D:/a/main.myc"));
  // UNC share: file://server/share/...
  assert.equal(u.fileOf("file://server/share/dir/a.myc"), "\\\\server\\share\\dir\\a.myc");
  assert.equal(u.keyOf("file://SERVER/Share/dir/a.myc"), u.keyOfFile("\\\\server\\share\\DIR\\a.myc"));
  assert.equal(u.uriOfFile("C:\\Users\\Ana B\\a.myc"), "file:///C:/Users/Ana%20B/a.myc");
  // untitled buffers keep their URI as identity and never collide with a file
  assert.equal(u.keyOf("untitled:Untitled-1"), "uri:untitled:Untitled-1");
});

test("posix keys stay case-sensitive (a case-sensitive volume holds both files)", () => {
  const u = makeUris("darwin");
  assert.notEqual(u.keyOf("file:///tmp/A.myc"), u.keyOf("file:///tmp/a.myc"));
  assert.equal(u.keyOf("file:///tmp/a%28b%29.myc"), u.keyOf("file:///tmp/a(b).myc"));
});
