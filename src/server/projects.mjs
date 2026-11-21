import { createExtensions } from "./extensions.mjs";
import fs from "node:fs";
import { loadToken } from "../editor/service.mjs";
import { serviceLocation } from "../shared/service-location.mjs";
import { createRoutes } from "./routes.mjs";
import { watchWorkspace } from "./watch.mjs";
import { forgetSnapshot, idsOf as registeredIds } from "../shared/workspace-columns.mjs";
import { isWorkspace, readRegistry, registryFile, workspaceId, workspaceKey } from "../shared/workspace-registry.mjs";
import { layoutOf } from "../shared/workspace.mjs";
import { projectBase, projectOfPath, localPath } from "../shared/workspace-address.mjs";
import { sendJson } from "../shared/http.mjs";
import { startup } from "../shared/startup.mjs";
import { globalLookFile } from "../shared/workspace-look.mjs";
import { createPresence } from "../workbench/presence.mjs";

// One HTTP host, with one editing runtime per storage directory. A runtime owns the same
// queues, history, catalog and index as before, but never a socket, child process or event relay.
// Paths select only registered project IDs; clients can never supply an arbitrary disk path.
export function createProjects({ reportsDirectory, watch = true, ...options }) {
  const token = loadToken(serviceLocation().data);
  const presence = createPresence(); // what the workbench's tabs report of what they have open: one store, whichever workspace's runtime hears it
  const runtimes = new Map(), pending = new Map(), watchers = new Map();
  let closed = false;
  const key = workspaceKey(reportsDirectory);
  const appearanceFile = globalLookFile();
  const appearanceChanged = () => {
    for (const runtime of runtimes.values()) runtime.appearanceChanged();
  };
  const changed = (root) => {
    forgetSnapshot(root);
    for (const runtime of runtimes.values()) runtime.refresh();
  };
  const lastUsed = new Map(), active = new Map();
  const access = {
    touch: roots => {
      const ids = registeredIds();
      for (const root of roots.values()) void resolve(root, ids).catch(error => options.logger?.warn?.(`[gallery] ${error.message}`));
    },
    indexOf: async (root, ids) => (await resolve(root, ids))?.workspace.index ?? null,
  };
  const home = createRoutes({ ...options, token, presence, reportsDirectory, unified: true, projects: access, onWorkspaceChange: changed, closeServer: async () => { await close(); await options.closeServer?.(); } });
  const extensions = createExtensions({ edits: home.edits });
  home.base = "";
  runtimes.set(key, home);

  async function resolve(root, ids = null) {
    if (closed) return null;
    const id = workspaceId(root), at = workspaceKey(root);
    if (at !== key) {
      // Reuse this request's registry, never a snapshot kept between requests: removing a
      // registration must immediately stop routing even to an already-open runtime.
      const roots = (ids ?? registeredIds()).get(id);
      if (!isWorkspace(root) || roots?.length !== 1 || workspaceKey(roots[0]) !== at) return null;
    }
    lastUsed.set(at, Date.now());
    if (runtimes.has(at)) return runtimes.get(at);
    if (!pending.has(at)) pending.set(at, (async () => {
      // A page of it someone else wrote is told on the home's stream, which the workbench listens to (updated ~ws-<id>/<slug>).
      const runtime = createRoutes({ ...options, token, presence, reportsDirectory: root, stateDirectory: layoutOf(root).state,
        base: projectBase(id), projects: access, onWorkspaceChange: changed, onUpdated: (key) => home.updated(key), announceServer: false, workbenchPage: null });
      runtime.base = projectBase(id);
      if (closed) { await runtime.close(); return null; }
      runtimes.set(at, runtime);
      if (watch) watchers.set(at, watchWorkspace(root, runtime.changed));
      return runtime;
    })().finally(() => pending.delete(at)));
    return pending.get(at);
  }

  let reconciling = null;
  function reconcile() {
    if (closed) return Promise.resolve();
    return reconciling ??= (async () => {
      const roots = readRegistry().workspaces.map(({ root }) => root);
      const live = new Set([key, ...roots.filter(isWorkspace).map(root => workspaceKey(root))]);
      for (const [at, runtime] of runtimes) if (!live.has(at)) {
        runtimes.delete(at); watchers.get(at)?.close(); watchers.delete(at); await runtime.close();
      }
    })().catch(error => options.logger?.warn?.(`[gallery] ${error.message}`)).finally(() => { reconciling = null; });
  }

  async function handle(request, response, next) {
    try {
      if (closed) return sendJson(response, 503, { ok: false, reason: "closing" });
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/__gallery/startup") {
        if (request.headers.host !== `127.0.0.1:${request.socket.localPort}`) return sendJson(response, 403, { ok: false, reason: "host" });
        if (request.method === "GET") return sendJson(response, 200, { ok: true, ...await startup().status() });
        if (request.method !== "POST") return sendJson(response, 405, { ok: false });
        const checked = await home.edits.check(request, 1024);
        if (checked.error) return sendJson(response, ...checked.error);
        try { return sendJson(response, 200, { ok: true, ...await startup().set(checked.body.enabled) }); }
        catch (error) { return sendJson(response, 400, { ok: false, message: error.message }); }
      }
      if (await extensions.handle(request, response)) return;
      const id = projectOfPath(url.pathname);
      if (!id) return home.handle(request, response, next);
      const ids = registeredIds(), roots = ids.get(id);
      const runtime = roots?.length === 1 ? await resolve(roots[0], ids) : null;
      if (!runtime) return sendJson(response, 404, { ok: false, reason: "workspace" });
      const local = localPath(url.pathname);
      // Global application settings and custom pages have one owner and one queue.
      const global = runtime === home || /^\/pages(?:\/|$)|^\/__gallery\/(?:pages?|components|net)(?:\/|$)|^\/__gallery\/workspace\/(?:stop|head|new-page|instructions|extension-edit|components)(?:\/|$)/.test(local);
      if (global) { response.writeHead(307, { Location: local + url.search }); response.end(); return; }
      const at = workspaceKey(roots[0]);
      active.set(at, (active.get(at) ?? 0) + 1);
      response.once("close", () => { active.set(at, active.get(at) - 1); lastUsed.set(at, Date.now()); });
      request.url = local + url.search;
      return runtime.handle(request, response, error => { request.url = url.pathname + url.search; next(error); });
    } catch (error) { next(error); }
  }
  const idle = setInterval(() => {
    // A visible workbench still needs every registered column's file changes, even when
    // none of that project's documents is open. Release only after that subscription ends.
    for (const [at, runtime] of runtimes) if (at !== key && !home.workbenchListeners && !active.get(at) && !runtime.listeners && Date.now() - lastUsed.get(at) > 120000) {
      runtimes.delete(at); watchers.get(at)?.close(); watchers.delete(at); lastUsed.delete(at); active.delete(at); void runtime.close().catch(error => options.logger?.warn?.(`[gallery] ${error.message}`));
    }
  }, 30000);
  idle.unref();
  async function close() {
    if (closed) return;
    closed = true; clearInterval(idle);
    fs.unwatchFile(registryFile(), registryChanged);
    fs.unwatchFile(appearanceFile, appearanceChanged);
    await extensions.close();
    for (const watcher of watchers.values()) watcher?.close();
    await Promise.all([...pending.values()]);
    await Promise.all([...runtimes.values()].map(runtime => runtime.close()));
    runtimes.clear();
  }
  const registryChanged = () => { changed(reportsDirectory); void reconcile(); };
  return {
    handle, resolve, edits: home.edits, workspace: home.workspace, stop: home.stop,
    changed(event, file) { for (const runtime of runtimes.values()) runtime.changed(event, file); },
    async listening(value) {
      await home.listening(value);
      await startup().sync().catch(error => options.logger?.warn?.(`[gallery] login startup: ${error.message}`));
      await reconcile();
      fs.watchFile(registryFile(), { interval: 500, persistent: false }, registryChanged);
      fs.watchFile(appearanceFile, { interval: 250, persistent: false }, appearanceChanged);
    },
    close,
  };
}
