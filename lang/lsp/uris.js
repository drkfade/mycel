"use strict";
// URI ⇄ file identity for the language server. Clients spell the same file differently: VS Code %-escapes every char
// outside [A-Za-z0-9-._~/] and sends a Windows drive as `file:///c%3A/...`, while Node writes `file:///C:/...`. Open
// documents are therefore keyed by the file they name (case-folded on Windows, whose file names are case-insensitive),
// and replies reuse the URI the client itself sent for an open document. `platform` is injectable so win32 rules are
// unit-tested on any OS.
const nodePath = require("path");
const { fileURLToPath, pathToFileURL } = require("url");

function makeUris(platform = process.platform) {
  const windows = platform === "win32";
  const paths = windows ? nodePath.win32 : nodePath.posix;
  const fileOf = (uri) => { try { return fileURLToPath(uri, { windows }); } catch { return uri; } };
  const keyOfFile = (file) => { const n = paths.normalize(file); return windows ? n.toLowerCase() : n; };
  // non-file URIs (untitled:) have no file identity; the URI string is the identity
  const keyOf = (uri) => /^file:/i.test(uri) ? keyOfFile(fileOf(uri)) : "uri:" + uri;
  const uriOfFile = (file) => pathToFileURL(file, { windows }).href;
  return { fileOf, keyOf, keyOfFile, uriOfFile, paths };
}

module.exports = { makeUris };
