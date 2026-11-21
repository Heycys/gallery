import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot, release, reportsDirectory as projectDirectory, viteConfigFile } from "../shared/paths.mjs";
import { answerOf, findPreviewServer, portIsFree, readAnnouncement } from "../shared/preview-server.mjs";
import { serviceLocation } from "../shared/service-location.mjs";
import { registerQuietly } from "../shared/workspace-registry.mjs";
import { defaultWorkspace } from "../shared/workspace.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { addressOf, firstPort, portsToTry } from "./server-process.mjs";

// gallery serve runs the shared service in the foreground. Every document folder uses it.
// Refuse a second service for the same data directory. Use --port, the saved port, or a free
// port from 8080/GALLERY_PORT. In a checkout Vite is its child; the package uses node:http.

const reportsDirectory = defaultWorkspace();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function run(argv) {
  await registerQuietly(projectDirectory);
  const { positional, values } = commandArguments({ values: ["--port"], argv });
  if (positional.length > 0) throw new UsageError(`gallery serve takes no arguments: ${positional[0]}`);
  const named = values.has("--port") ? Number(values.get("--port")) : null;
  if (named !== null && !(Number.isInteger(named) && named > 0 && named < 65536)) throw new UsageError(`--port takes a port number: ${values.get("--port")}`);

  const found = await readAnnouncement();
  const answer = found ? await answerOf(found, 10_000) : "no";
  if (answer !== "no") {
    console.error(`The shared Gallery server runs already: ${addressOf(found.port)} (pid ${found.pid}${answer === "busy" ? ", not answering now" : ""}). gallery stop stops it; one server serves a Gallery data directory.`);
    process.exit(1);
  }
  let port = null;
  if (named !== null) {
    if (!(await portIsFree(named))) {
      console.error(`Port ${named} is taken: name another (--port), or leave it out for the first free one.`);
      process.exit(1);
    }
    port = named;
  } else {
    for (const candidate of await portsToTry()) {
      if (await portIsFree(candidate)) {
        port = candidate;
        break;
      }
    }
    if (port === null) {
      console.error(`No port from ${firstPort()} is free: name one (--port <n>).`);
      process.exit(1);
    }
  }

  if (release) {
    process.env.GALLERY_SERVER_KIND = "cli";
    const { startProductionServer } = await import("../server/production.mjs");
    await startProductionServer({ reportsDirectory, port, kind: "cli" });
    await fs.writeFile(serviceLocation().lastPortFile, `${port}\n`).catch(() => {});
    console.log(`Gallery serves ${reportsDirectory} at ${addressOf(port)} (Chrome or Edge). Ctrl+C stops it.`);
    return; // it runs until Ctrl+C, gallery stop, or its package replaced
  }
  const { writeSharedAssets } = await import("../render/pipeline.mjs");
  await writeSharedAssets();
  const child = spawn(process.execPath, [path.join(projectRoot, "node_modules", "vite", "bin", "vite.js"), "--config", viteConfigFile, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: projectRoot,
    env: { ...process.env, GALLERY_WORKSPACE: reportsDirectory, GALLERY_SERVER_KIND: "cli" },
    stdio: "inherit",
  });
  // Ctrl+C reaches the child on its own where the terminal sends it to the process group; a SIGTERM
  // (a parent stopping this command) is passed on.
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  const ended = new Promise((resolve) => child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0))));
  // Said once it answers as the shared Gallery server (its announcement names the child's process).
  for (;;) {
    const result = await Promise.race([ended.then((code) => ({ code })), sleep(300).then(() => null)]);
    if (result) process.exit(result.code);
    const running = await findPreviewServer({ answering: true, timeout: 2000 });
    if (running?.pid === child.pid) break;
  }
  await fs.writeFile(serviceLocation().lastPortFile, `${port}\n`).catch(() => {});
  console.log(`Gallery serves ${reportsDirectory} at ${addressOf(port)} (Chrome or Edge). Ctrl+C stops it.`);
  process.exit(await ended);
}
