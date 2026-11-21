import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

// server-process captures its data directory at import; keep this test separate from
// the other unit files' cached modules and environment in the aggregate runner.
if (process.argv[2] !== "--isolated") {
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(import.meta.url), "--isolated"], { timeout: 15000 });
  process.stdout.write(stdout);
} else {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-service-ports-"));
  process.env.GALLERY_DATA_DIR = root;
  process.env.GALLERY_DEFAULT_WORKSPACE = path.join(root, "home");
  delete process.env.GALLERY_PORT;
  const { FIRST_PORT, firstPort, portsToTry } = await import("../../src/cli/server-process.mjs");
  const { previewServerFor } = await import("../../src/shared/preview-server.mjs");
  const last = path.join(root, "last-port");
  const occupied = net.createServer();
  const available = net.createServer();
  try {
    const defaults = Array.from({ length: 20 }, (_, i) => 8080 + i);
    assert.equal(FIRST_PORT, 8080);
    assert.deepEqual(await portsToTry(), defaults);
    assert.equal(firstPort({ GALLERY_PORT: "9000" }), 9000);
    await fs.writeFile(last, "4317\n");
    assert.deepEqual(await portsToTry(), [4317, ...defaults], "upgrades preserve the previous port");
    await fs.writeFile(last, "8087\n");
    assert.deepEqual(await portsToTry(), [8087, ...defaults.filter(port => port !== 8087)], "the saved port is tried once, first");
    assert.deepEqual(await portsToTry({ first: 9000, count: 2 }), [8087, 9000, 9001], "an override keeps the saved port's existing priority");
    await fs.writeFile(last, "invalid\n");
    assert.deepEqual(await portsToTry(), defaults);
    await new Promise(resolve => occupied.listen(0, "127.0.0.1", resolve));
    await new Promise(resolve => available.listen(0, "127.0.0.1", resolve));
    const busyPort = occupied.address().port, freePort = available.address().port;
    await new Promise(resolve => available.close(resolve));
    const picked = await previewServerFor({ ports: [busyPort, freePort], start: async port => ({ port }) });
    assert.equal(picked.port, freePort);
    assert.deepEqual(picked.passed, [`${busyPort} (in use)`]);
    assert.ok(occupied.listening, "a conflicting service is left running");
    const none = await previewServerFor({ ports: [busyPort], start: () => assert.fail("must not start on an occupied port") });
    assert.equal(none.port, null);
    console.log("Checked default 8080–8099, saved old ports, overrides, occupied-port fallback and exhaustion.");
  } finally {
    if (available.listening) await new Promise(resolve => available.close(resolve));
    if (occupied.listening) await new Promise(resolve => occupied.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
}
