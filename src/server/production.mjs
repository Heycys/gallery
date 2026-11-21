import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import { editStateDirectory, kitPublicDirectory, release, releaseFile, reportsDirectory as defaultReportsDirectory, vendorDirectory, workbenchDirectory } from "../shared/paths.mjs";
import { serviceLocation } from "../shared/service-location.mjs";
import { serve } from "../shared/http.mjs";
import { defaultWorkspace, ensureWorkspace, layoutOf } from "../shared/workspace.mjs";
import { homeFailure, makeDefaultHome } from "../editor/home-page.mjs";
import { installOfficialPacks } from "../shared/block-packs.mjs";
import { followOnRead, followShipped } from "../shared/shipped-blocks.mjs";
import { createProjects } from "./projects.mjs";
import { serveStatic } from "./static.mjs";
import { watchWorkspace } from "./watch.mjs";

// The release's server (docs/render.md, "Live preview"): node:http on 127.0.0.1, no Vite. The
// preview's routes (./routes.mjs, the dev server's own), then the built workbench and the kit's and
// vendors' files by their path (./static.mjs), else 404; the workspace watched by ./watch.mjs. Started
// by a gallery command as its own process (dist/server.mjs --port <n>: ./start.mjs, a keeper running it
// as its worker and starting it again when it crashes: ./supervisor.mjs; GALLERY_SERVER_KIND says "cli"),
// detached, or in the foreground by gallery serve. It stops on POST /__gallery/workspace/stop
// (gallery stop, and a command replacing an older Gallery's server), on SIGINT/SIGTERM, and by itself
// when the package it runs from is replaced (npm i -g of another version writes a new release.json:
// its chunks, browser modules and kit are then another version's, which it would serve under its own
// stamps), so that its keeper (or the next command) starts the new one. Closing, it ends the pages' event streams,
// takes its announcement away (<data>/server.json) and keeps its port in <data>/last-port.

/**
 * Start the server on `port` (127.0.0.1 only). `web`: the built workbench's folder (index.html,
 * assets/), the release's; `kind`: "cli" (default) or "dev"; `exit(code, why)`: what ends the process once it
 * closed (POST stop, a signal: why "stopped"; a new release: why "replaced", which a worker ends with an exit
 * code its keeper starts the new package's server on: ./start.mjs); `watch`: whether the workspace is watched. Resolves to
 * { server, port, routes, close() } once it listens and has announced itself.
 */
export async function startProductionServer({
  reportsDirectory = defaultWorkspace(), port, web = workbenchDirectory, kind = process.env.GALLERY_SERVER_KIND === "dev" ? "dev" : "cli",
  stateDirectory = layoutOf(reportsDirectory).state, exit = (code = 0) => process.exit(code), watch = true, signals = true, log = console,
} = {}) {
  await ensureWorkspace(reportsDirectory);
  // Gallery's own packs installed (once each, then as this Gallery's: shared/block-packs.mjs), its blocks as
  // they were added brought up to this Gallery's, now and whenever the catalog reads them (shared/shipped-blocks.mjs).
  await installOfficialPacks(reportsDirectory, { log: (line) => log.log(`[gallery] ${new Date().toISOString()} ${line}`) });
  followOnRead(reportsDirectory, (line) => log.log(`[gallery] ${new Date().toISOString()} ${line}`));
  followShipped(reportsDirectory);
  // The default home page, once for a workspace (src/editor/home-page.mjs), before the routes read the catalog.
  const home = await makeDefaultHome(reportsDirectory, { stateDirectory });
  if (home.did === "made") log.log(`[gallery] ${new Date().toISOString()} the default home page made: ${home.file} (${home.cards.length} cards)`);
  else if (home.did === "failed") log.warn(`[gallery] ${new Date().toISOString()} ${homeFailure(home)}`); // and the server starts all the same
  let server = null;
  let watcher = null;
  let releaseWatch = null;
  const layout = serviceLocation();
  // Closed: no new request, every open one (the pages' event streams) ended, the port kept for next time.
  const closeServer = async () => {
    watcher?.close();
    if (releaseWatch) fs.unwatchFile(releaseFile, releaseWatch);
    await fsp.writeFile(layout.lastPortFile, `${port}\n`).catch(() => {});
    await new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  };
  const logger = { info: (text) => log.log(text), warn: (text) => log.warn(text), error: (text) => log.error(text) };
  let replaced = false; // the package replaced under it: said to exit, so that its keeper starts the new one
  const routes = createProjects({ reportsDirectory, watch, stateDirectory, logger, kind, closeServer, exit: () => exit(0, replaced ? "replaced" : "stopped") });
  server = http.createServer((request, response) => {
    routes.handle(request, response, async (error) => {
      if (error) {
        log.error(`[gallery] ${request.method} ${request.url}: ${error.stack ?? error.message}`);
        if (!response.headersSent) serve(response, { status: 500 });
        else response.end();
        return;
      }
      try {
        if (await serveStatic(request, response, { web, kit: kitPublicDirectory, vendor: vendorDirectory })) return;
      } catch (failure) {
        log.error(`[gallery] ${request.url}: ${failure.message}`);
      }
      if (!response.headersSent) serve(response, { status: 404 });
    });
  });
  // An open page's event stream stays open for as long as the page: never timed out (the request is read whole at once).
  server.keepAliveTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  port = server.address().port;
  try { await routes.listening(port); } catch (error) { await closeServer(); await routes.close(); throw error; }
  if (watch) watcher = watchWorkspace(reportsDirectory, routes.changed);
  // The package replaced under it (an upgrade): it stops, as POST stop stops it, and the next command starts the new one.
  if (release) {
    const text = fs.readFileSync(releaseFile, "utf8");
    releaseWatch = () => {
      let now = null;
      try {
        now = fs.readFileSync(releaseFile, "utf8");
      } catch {}
      if (now === text) return;
      log.log("[gallery] The package was replaced (another version installed): this server stops; its keeper (or the next gallery command) starts the new one.");
      replaced = true;
      routes.stop();
    };
    fs.watchFile(releaseFile, { interval: 3000, persistent: false }, releaseWatch);
  }
  if (signals) for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => routes.stop());
  return {
    server,
    port,
    routes,
    /** Closed without ending the process (the tests). */
    async close() {
      await closeServer();
      await routes.close();
    },
  };
}
