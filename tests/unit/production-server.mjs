import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

// The release's own server (src/server/production.mjs: node:http, the preview's routes, the built
// workbench and the kit's files, no Vite), started from source in a process and a workspace of its
// own (tests/unit/fixtures/production-server.mjs says what it checks), on a free port of
// GALLERY_TEST_PORTS ("4200-4260" when set; else 4240-4260).

const free = (port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", () => resolve(false));
  server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
});
const [, low, high] = /^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [null, "4240", "4260"];
let port = null;
for (let candidate = Number(high); candidate >= Number(low) && port === null; candidate--) if (await free(candidate)) port = candidate;
assert.ok(port, `no free port in ${low}-${high}`);

const studio = mkdtempSync(path.join(tmpdir(), "production-server-"));
const temporary = path.join(studio, "temp");
mkdirSync(temporary);
try {
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "fixtures", "production-server.mjs")], {
    encoding: "utf8",
    // A temporary folder of its own: what the server leaves in the system's is seen there.
    // Its start makes the workspace's default home page (GALLERY_NO_DEFAULT_HOME, which the unit tests run with, unset for it).
    // The machine's registry of workspaces a folder of its own: the server's start registers its
    // workspace (src/server/routes.mjs listening), which is not in that process's temporary folder.
    env: { ...process.env, GALLERY_WORKSPACE: path.join(studio, "workspace"), GALLERY_DEFAULT_WORKSPACE: path.join(studio, "workspace"), PORT: String(port), GALLERY_NO_DEFAULT_HOME: "", GALLERY_DATA_DIR: path.join(studio, "data"), ...Object.fromEntries(["TMPDIR", "TEMP", "TMP"].map((name) => [name, temporary])) },
    timeout: 120_000,
  });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  const registered = JSON.parse(readFileSync(path.join(studio, "data", "workspaces.json"), "utf8")).workspaces.map(({ root }) => root);
  assert.deepEqual(registered, [path.join(studio, "workspace")], "the server's start registered its workspace");
} finally {
  rmSync(studio, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked the release's server (src/server/production.mjs): the workbench's page never kept and its assets kept for good, the kit's files by their path and by their stamp, KaTeX's fonts, a document's page and its pictures, the default home page made as it starts (its two cards, served with its first-open note); 404 for anything else, a path leaving its folder refused (encoded, dotted, a backslash, a drive, a NUL), another host refused (403); its announcement while it runs; a page told of its document's change through the watcher; POST stop checked by the token, then ending it within 2 s with an event stream open, its announcement and its uploads' folder gone and its port kept; and the watcher one folder at a time (Linux's way): each document's folders, a new one's once it is there, the 写作偏好 page's, never Gallery's own state.");
