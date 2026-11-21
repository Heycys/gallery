import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRoutes } from "../../../src/server/routes.mjs";
import { reportsDirectory } from "../../../src/shared/paths.mjs";
import { watchWorkspace } from "../../../src/server/watch.mjs";
import { defaultWorkspace } from "../../../src/shared/workspace.mjs";

// Run by tests/unit/extensions.mjs in a workspace of its own (GALLERY_WORKSPACE): what the server's
// handler of the watcher's news (src/server/routes.mjs changed) tells the workbench of an extension's
// folder. A sidebar.json written is told; news of the folder itself or of another file in it is told
// only when the columns changed: a file the extension's own program writes there, which the recursive
// watch of Windows and macOS reports as the folder's change (src/server/watch.mjs: addDir), is not; a
// folder moved in with its sidebar.json, or moved away (the watch says unlink: nothing left to stat), is.

const folder = (...names) => path.join(reportsDirectory, "extensions", ...names);
const sidebar = JSON.stringify({ title: "演示", entries: [] });
await fs.mkdir(folder("demo"), { recursive: true });
await fs.writeFile(folder("demo", "sidebar.json"), sidebar);

const routes = createRoutes({ stateDirectory: mkdtempSync(path.join(tmpdir(), "extension-watch-state-")), logger: { warn() {}, error() {}, info() {} } });
const PORT = 4997;
const heard = [];
let closed = null;
routes.handle({ url: "/__gallery/events?workspace", method: "GET", headers: { host: `127.0.0.1:${PORT}` }, socket: { localPort: PORT }, on: (event, listener) => { if (event === "close") closed = listener; } }, { writeHead() {}, write: (text) => heard.push(text) }, () => {});
const told = () => heard.filter((text) => text.startsWith("data: workspace ")).length;
const settled = () => new Promise((resolve) => setTimeout(resolve, 700)); // the folders read again 120ms on, the workbench told 120ms after
await settled();

// The extension's program writes its own files: the folder's news, the columns as they were.
await fs.writeFile(folder("demo", "cache.json"), "{}");
routes.changed("add", folder("demo", "cache.json"));
routes.changed("addDir", folder("demo"));
await fs.mkdir(folder("demo", "logs"));
routes.changed("addDir", folder("demo", "logs"));
routes.changed("change", folder("demo", "logs", "today.log"));
await settled();
assert.equal(told(), 0, "a file the extension writes in its folder, and the folder's change the watch reports with it: the workbench is not told");

// Its sidebar.json written: told, once for the burst.
await fs.writeFile(folder("demo", "sidebar.json"), JSON.stringify({ title: "演示二", entries: [] }));
routes.changed("change", folder("demo", "sidebar.json"));
routes.changed("addDir", folder("demo"));
await settled();
assert.equal(told(), 1, "sidebar.json written: told once");

// A file of its columns/ (what its program writes for the sidebar): told, as a sidebar.json is.
await fs.mkdir(folder("demo", "columns"));
await fs.writeFile(folder("demo", "columns", "docs.json"), JSON.stringify({ title: "文档", entries: [] }));
routes.changed("add", folder("demo", "columns", "docs.json"));
await settled();
assert.equal(told(), 2, "a file of columns/ written: told");

// An extension's folder moved in whole: only the folder's news, and a column more.
await fs.mkdir(folder("other"), { recursive: true });
await fs.writeFile(folder("other", "sidebar.json"), sidebar);
routes.changed("addDir", folder("other"));
await settled();
assert.equal(told(), 3, "a folder moved in with its sidebar.json: told");

// A folder with no sidebar.json is no column.
await fs.mkdir(folder("bare"));
routes.changed("addDir", folder("bare"));
await settled();
assert.equal(told(), 4, "a new extension directory refreshes available extensions");

// The folder moved away: the watch says unlink, as for a file (it can no longer tell a folder).
await fs.rm(folder("other"), { recursive: true });
routes.changed("unlink", folder("other"));
await settled();
assert.equal(told(), 5, "a folder moved away: told");

// Real filesystem events from the public source, without a default-workspace server and even when
// that workspace did not exist when this project's watcher started.
const watcher = watchWorkspace(reportsDirectory, routes.changed);
const beforePublic = told();
const publicFolder = path.join(defaultWorkspace(), "extensions", "public-watch");
const publicFile = path.join(publicFolder, "sidebar.json");
await fs.mkdir(publicFolder, { recursive: true });
await fs.writeFile(publicFile, sidebar);
await settled();
assert.ok(told() > beforePublic, "a public workspace created later is discovered without making a server for it");
let previous = told();
await fs.writeFile(publicFile + ".tmp", JSON.stringify({ title: "公共新名", entries: [] }));
await fs.rename(publicFile + ".tmp", publicFile);
await settled();
assert.ok(told() > previous, "atomic public sidebar replacement refreshes the project's sidebar");
previous = told();
await fs.writeFile(path.join(publicFolder, "cache.json"), "{}");
await settled();
assert.equal(told(), previous, "unrelated public extension data does not refresh the sidebar");
await fs.rm(publicFile);
await settled();
assert.ok(told() > previous, "removing a public column is seen too");

watcher.close();
closed?.();
await routes.close();
console.log("extension folders watched");
