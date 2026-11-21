import fs from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../shared/paths.mjs";
import { installOfficialPacks } from "../shared/block-packs.mjs";
import { followOnRead, followShipped } from "../shared/shipped-blocks.mjs";
import { defaultWorkspace, layoutOf, ensureWorkspace } from "../shared/workspace.mjs";
import { homeFailure, makeDefaultHome } from "../editor/home-page.mjs";
import { createProjects } from "./projects.mjs";
import { changeOf, ignoredIn, sourceWatched } from "./routes.mjs";

// The Vite dev-server plugin of npm run dev:local and of the servers the gallery commands start in a
// source checkout (src/cli/server-process.mjs): the preview's routes (./routes.mjs, which the
// release's own server serves too: ./production.mjs) in Vite's middleware, before Vite's own, and
// Vite only for the workbench (src/workbench/app/, React: its modules transformed, their hot reload)
// and public/ (the kit's and vendors' files by their path, what npm run dev's predev wrote). Vite's
// watcher (chokidar) tells the routes of a change in the workspace, the kit's sources and the
// editor's modules.

export { changeOf, ignoredIn };

const workbenchPage = path.join(projectRoot, "src", "workbench", "app", "index.html");

/** Prepare the default home: shipped blocks, their updates, and the initial home page.
 * Document-only project folders are registered separately and keep their files in place. */
export async function adoptWorkspace(root) {
  await ensureWorkspace(root);
  // Gallery's own packs installed (once each, then as this Gallery's), its blocks as they were added
  // brought up to this Gallery's, now and whenever the catalog reads them.
  await installOfficialPacks(root, { log: (line) => console.log(`[gallery] ${line}`) });
  followOnRead(root, (line) => console.log(`[gallery] ${line}`));
  followShipped(root);
  const home = await makeDefaultHome(root);
  if (home.did === "made") console.log(`[gallery] the default home page made: ${home.file} (${home.cards.length} cards)`);
  else if (home.did === "failed") console.warn(`[gallery] ${homeFailure(home)}`); // and the server starts all the same
  return { home };
}

export function reportPreview() {
  const reportsDirectory = defaultWorkspace();
  const stateDirectory = layoutOf(reportsDirectory).state;
  return {
    name: "gallery",
    apply: "serve",
    configureServer(server) {
      // What this server is: one a gallery command started (GALLERY_SERVER_KIND=cli, src/cli/server-process.mjs),
      // which gallery stop stops, or npm run dev's, stopped where it runs.
      const kind = process.env.GALLERY_SERVER_KIND === "cli" ? "cli" : "dev";
      const routes = createProjects({ reportsDirectory,
        stateDirectory,
        logger: server.config.logger,
        kind,
        // The workbench's page, Vite's way (/@vite/client and the React refresh preamble added).
        workbenchPage: async (url, request) => server.transformIndexHtml(url, await fs.readFile(workbenchPage, "utf8"), request.originalUrl),
        closeServer: async () => {
          server.httpServer?.closeAllConnections?.();
          await server.close();
        },
      });
      server.httpServer?.once("listening", () => {
        const port = server.httpServer.address()?.port;
        if (!port) return;
        routes.listening(port).then(() => server.httpServer.once("close", () => routes.close()), async error => { server.config.logger.error(error.message); await routes.close(); await server.close(); });
      });
      // Registered here, before Vite's own middlewares, so these routes win over Vite's static files and its SPA fallback.
      server.middlewares.use(routes.handle);
      server.watcher.add([reportsDirectory, ...sourceWatched]);
      server.watcher.on("all", (event, file) => routes.changed(event, file));
      // A file the watcher cannot watch (EBUSY or EPERM: another program holds it on Windows) is said and
      // passed over: unheard, chokidar's error event stopped the whole server (2026-11-08, 2026-11-13).
      server.watcher.on("error", (error) => server.config.logger.warn(`[gallery] not watched: ${error?.path ?? ""} (${error?.code ?? error?.message ?? error})`));
    },
  };
}
