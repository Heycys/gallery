// A custom block online (docs/render.md, "A block online"): its context.fetch, for a block
// whose needs name a host of the net ("net:<host>"), the consent it asks the reader for on its own card,
// and its instances started again as that consent changes.
//
//   - context.fetch(url, { as }) asks whoever serves the page (doc-net-fetch, cancelable, on window:
//     { ask: { block, url, as, doc }, answer(promise) }: the server's live script, which asks its net route,
//     src/server/net-route.mjs), which reaches the web for it, as a host of its needs the reader allowed,
//     and answers { data, at, cached }; a page no server answers for is "offline";
//     a refusal rejects with an Error whose `code` says why (consent, host, url, private, key, rate,
//     status, type, too-large, offline, missing) and, as the answer says them, `hosts`, `host`, `status`;
//   - in an exported file (place "export") nothing is asked of any server: the answer the export embedded
//     for that address (script[data-doc-snapshot], its `net`), or code "offline";
//   - refused for its consent, the instance gets a bar the kit draws after it (data-doc-dev: no file, no
//     export, no copy of the view holds it), over its card on a custom page (its line there the block's
//     card.consent, else 允许联网之后显示内容; data-doc-net-narrow on a card under 240px of content, three cells or
//     fewer, where the line stands over the button, as wide as the card): 允许访问 <host>, whose press
//     asks whoever shows the page (doc-net-consent, cancelable, { block, hosts }: in a workbench the
//     page's session, which opens the workbench's consent dialog, the one 设置 › 组件列表 opens); a page
//     on its own opens the workbench at it instead;
//   - what the page is told of the consents (doc-settings-changed's `net`, "<id>@<host>" each, from its
//     event stream's settings line) starts again each instance whose block's consents changed (allowed:
//     it fetches now; taken back: it is refused, and asks again) and each one refused that may fetch now.

import { netHostsOf } from "../../../shared/net-policy.mjs";
import { sayRuntime as say } from "../words.js";
import { kitLanguage } from "../words.js";

export const CONSENT_BAR = "doc-net-consent";

/**
 * restart(host): the instance on `host` started again. instances(): [[host, def]] of the instances live.
 * Returns { fetchFor(def, host, place), forget(host) }: what makes an instance's context.fetch, and an
 * instance gone (its bar with it).
 */
export function createNet({ restart, instances, describe }) {
  const global = globalThis;
  const refused = new Map(); // host -> { id, hosts }: refused for its consent, waiting
  const bars = new Map(); // host -> its bar
  let consents = null; // what the page was told last ("<id>@<host>"), null before it was told

  let snapshot;
  const embedded = () => {
    if (snapshot !== undefined) return snapshot;
    try {
      snapshot = JSON.parse(document.querySelector("script[data-doc-snapshot]")?.textContent ?? "null");
    } catch {
      snapshot = null;
    }
    return snapshot;
  };
  const failure = (code, message, fields = {}) => Object.assign(new Error(message), { code, ...fields });
  // An answer as `as` reads it, from a snapshot, which held it as the document's instance asked for it.
  const read = (data, as) => {
    if (as === "text") return typeof data === "string" ? data : JSON.stringify(data);
    if (typeof data !== "string") return data;
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  };
  const ownSlug = () => document.querySelector(".doc-page")?.dataset.docId || null;
  // A bar on a card under 240px of content (three cells or fewer) stands its line over its button, as wide as the card.
  const NARROW = 240;
  // What a block says of its banner on its instance (its face's padding and head: styles/base.css), carried onto
  // the banner, the instance's sibling, which inherits nothing of it; read again as the card's size changes (a
  // face of another padding).
  const OWN = ["--gallery-consent-top", "--gallery-consent-pad", "--gallery-consent-fill"];
  const fit = (bar) => {
    const card = bar.parentElement;
    if (!card?.classList.contains("gallery-card")) return;
    const style = global.getComputedStyle(card);
    const inner = card.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    bar.toggleAttribute("data-doc-net-narrow", inner > 0 && inner < NARROW);
    const host = bar.previousElementSibling;
    const said = host ? global.getComputedStyle(host) : null;
    for (const name of OWN) {
      const value = said?.getPropertyValue(name).trim() ?? "";
      if (value) bar.style.setProperty(name, value);
      else bar.style.removeProperty(name);
    }
  };
  // Each bar fitted at once, and again once the blocks have drawn in their frame (a face of another padding).
  const fitAll = () => {
    for (const bar of bars.values()) if (bar.isConnected) fit(bar);
  };
  global.addEventListener("doc-layout-change", () => {
    fitAll();
    global.requestAnimationFrame?.(() => global.requestAnimationFrame(fitAll));
  });
  const pageSlug = () => (/^\/pages\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1] ?? null);

  function clear(host) {
    refused.delete(host);
    bars.get(host)?.remove();
    bars.delete(host);
  }

  // The reader asked to allow it: whoever shows the page opens the consent dialog; a page on its own
  // (no workbench took the event) opens the workbench at it, where the dialog is.
  function ask(id, hosts) {
    const asked = new CustomEvent("doc-net-consent", { cancelable: true, detail: { block: id, hosts } });
    if (global.dispatchEvent(asked)) {
      const page = pageSlug();
      const slug = ownSlug();
      global.open(`${location.origin}/${page ? `#@${page}` : slug ? `#${slug}` : ""}`, "_blank", "noopener");
    }
  }

  function showConsent(host, id, hosts) {
    refused.set(host, { id, hosts });
    let bar = bars.get(host);
    if (!bar?.isConnected) {
      bar = document.createElement("div");
      bar.className = CONSENT_BAR;
      bar.setAttribute("data-doc-dev", "");
      bar.setAttribute("contenteditable", "false");
      bar.setAttribute("role", "group");
      const why = document.createElement("span");
      why.className = `${CONSENT_BAR}-why`;
      // On a card (a banner over the card under its head row): whose the data is, under the why, and the button's words short.
      const from = document.createElement("span");
      from.className = `${CONSENT_BAR}-from`;
      const words = document.createElement("span");
      words.className = `${CONSENT_BAR}-words`;
      words.append(why, from);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${CONSENT_BAR}-allow`;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const waiting = refused.get(host);
        if (waiting) ask(waiting.id, waiting.hosts);
      });
      bar.append(words, button);
      host.after(bar);
      bars.set(host, bar);
    }
    const [first, ...others] = hosts;
    // On a card, the line a reader reads: the block's own (its card.consent), else the kit's; in a document the long one.
    const onCard = host.parentElement?.classList.contains("gallery-card") === true;
    const own = describe(id)?.consent?.[kitLanguage()];
    const reason = onCard ? (typeof own === "string" && own ? own : say("net-card-why")) : say("net-why");
    bar.querySelector(`.${CONSENT_BAR}-why`).textContent = reason;
    fit(bar);
    const button = bar.querySelector(`.${CONSENT_BAR}-allow`);
    const long = document.createElement("span");
    long.className = `${CONSENT_BAR}-long`;
    long.textContent = others.length > 0 ? say("net-allow-many", first, hosts.length) : say("net-allow", first);
    const short = document.createElement("span");
    short.className = `${CONSENT_BAR}-short`;
    short.textContent = say("net-allow-short");
    button.replaceChildren(long, short);
    button.setAttribute("aria-label", long.textContent);
    // Whose the data is: the site all the hosts are of where they share one (api. and geocoding-api.open-meteo.com: open-meteo.com), else the first and how many.
    const site = (/** @type {string} */ name) => name.split(".").slice(-2).join(".");
    const shared = hosts.every((name) => site(name) === site(first)) ? site(first) : null;
    bar.querySelector(`.${CONSENT_BAR}-from`).textContent = shared ? say("net-from", shared) : others.length > 0 ? say("net-from-many", first, hosts.length) : say("net-from", first);
    // The hosts, one a line, in the kit's tooltip (tip.js), not the browser's square title.
    button.setAttribute("data-doc-tip", hosts.join("\n"));
    bar.setAttribute("aria-label", reason);
  }

  // What the page is told of the consents: each instance whose block's consents changed starts again,
  // and each one refused that may fetch now; the first time, only those.
  global.addEventListener("doc-settings-changed", (event) => {
    const told = event.detail?.net;
    if (!Array.isArray(told)) return;
    const before = consents;
    consents = new Set(told);
    for (const [host, def] of instances()) {
      const hosts = netHostsOf(describe(def.id)?.needs);
      if (hosts.length === 0) continue;
      const pair = (name) => `${def.id}@${name}`;
      const changed = before !== null && hosts.some((name) => before.has(pair(name)) !== consents.has(pair(name)));
      const waiting = refused.get(host);
      if (changed || (waiting && waiting.hosts.every((name) => consents.has(pair(name))))) {
        clear(host);
        restart(host);
      }
    }
  });

  return {
    /** The context.fetch of the instance of `def` on `host`, at `place` (context.place). */
    fetchFor: (def, host, place) => async (url, options = {}) => {
      const as = options?.as ?? "json";
      if (as !== "json" && as !== "text") throw failure("url", `context.fetch: as is "json" or "text", not ${JSON.stringify(as)}`);
      if (place === "export") {
        let name;
        try {
          const address = new URL(url);
          address.hash = "";
          name = address.href;
        } catch {
          throw failure("url", `context.fetch: ${url} is not an absolute address`);
        }
        const kept = embedded()?.net?.[name];
        if (!kept) throw failure("offline", `an exported file reaches no network, and holds no answer for ${name}`);
        return { data: read(kept.data, as), at: kept.at, cached: true };
      }
      /** @type {Promise<any> | null} */
      let asked = null;
      const ask = { block: def.id, url, as, ...(place === "document" && ownSlug() ? { doc: ownSlug() } : {}) };
      global.dispatchEvent(new CustomEvent("doc-net-fetch", { cancelable: true, detail: { ask, answer: (promise) => { asked = promise; } } }));
      if (!asked) throw failure("offline", "no server shows this page: nothing reaches the network for it");
      let answer;
      try {
        answer = await asked;
      } catch (error) {
        throw failure("offline", `the server did not answer: ${error?.message ?? error}`);
      }
      if (answer?.ok) {
        if (refused.has(host)) clear(host);
        return { data: answer.data, at: answer.at, cached: Boolean(answer.cached) };
      }
      const { code = "offline", why, hosts, host: name, status } = answer ?? {};
      if (code === "consent" && Array.isArray(hosts) && host.isConnected) showConsent(host, def.id, hosts);
      throw failure(code, `${def.id}: ${url}: ${code}${why ? ` (${why})` : ""}`, { ...(hosts ? { hosts } : {}), ...(name ? { host: name } : {}), ...(status ? { status } : {}) });
    },
    forget: clear,
  };
}
