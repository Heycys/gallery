import dns from "node:dns";
import { fetchPinned, proxyFor as systemProxy, readWhole } from "../editor/net-fetch.mjs";
import { currentCatalog } from "../shared/component-catalog.mjs";
import { sendJson } from "../shared/http.mjs";
import { createNetCache, dataOf } from "../shared/net-cache.mjs";
import { readKeys } from "../shared/net-keys.mjs";
import { addressKind, addressOf, hostIn, keptHere, keyIn, mapsHere, netHostsOf, proxyHere, withKey } from "../shared/net-policy.mjs";
import { galleryVersion } from "../shared/preview-server.mjs";

// The net route (docs/render.md, "A block online"): the
// one way a custom block reaches the web, POST /__gallery/net, which the kit's context.fetch sends
// (src/render/kit/runtime/net.js): { block, url, as ("json" | "text"), doc (the document's slug, where the
// instance is in one) }. Checked as a page's request is (POST, the exact Host, the Origin, a JSON body) but
// for the token, which a page no editor runs on (演示视图, a page alone) does not hold: what keeps another
// site out is the Origin and the JSON body, which its page can send only after a preflight no route
// answers. Answered 200 with { ok: true, data, at, cached } or { ok: false, code, … } (the codes
// a block's context.fetch rejects with), so that a card refused draws no error in the console.
//
// What a block may reach, in this order, each a refusal of its own:
//   - a block of the catalog in use (not disabled: such a one is not in it), whose needs name the host
//     of the address (net:<host>, ./net-policy.mjs), an http or https address at its scheme's port with no
//     user in it (code "missing", "url", "host");
//   - which the reader allowed that block to reach: gallery.json's components.net, its card's 允许访问 and
//     设置 › 组件列表 (code "consent", with `hosts`, those of its needs not allowed yet);
//   - with the workspace's key for its host where the address names one ({key}: ./net-keys.mjs; code
//     "key", with `host`);
//   - an answer of the last FRESH ms is the one given (cached: true); else no more than RATE fetches of
//     that block a minute (code "rate" where nothing is kept);
//   - only GET, no cookie sent, none kept (set-cookie is read by no one), a JSON or text answer (by its
//     type; none said is read as text) of at most LIMIT bytes unpacked, within TIMEOUT for all its hops
//     (code "type", "too-large", "status" with `status` for an answer that is no 2xx);
//   - the machine reached is one of the public internet: the host's name resolved here, once a hop
//     (`resolve`), every address it gives checked, and the request made to the address checked, never
//     to the name again (fetchPinned): a DNS rebinding answers the second ask with another address, and
//     there is no second ask. Through the proxy this computer's browser uses (net-fetch.mjs proxyFor) it
//     is a CONNECT to that address (an https address; an http one names it in the request), the name kept
//     for TLS; 198.18.0.0/15 (a fake-ip proxy's DNS: Clash's) is taken only while that proxy is a program
//     on this computer, which then reaches what it maps the address to, a machine Gallery cannot check. A
//     name whose addresses that are not public are all this computer's or unique-local (mapsHere: a proxy
//     of this computer that maps names to 127.x or fd00:: addresses of its own, as one in use in China
//     does) is handed by its name to that proxy while it is a program of this computer and the address is
//     https (a CONNECT to <name>:443), which resolves it itself: TLS is then the guard, the certificate
//     held to the name against the public CAs alone whatever NODE_TLS_REJECT_UNAUTHORIZED says, and
//     nothing of the request sent before it is. A public CA's certificate proves the name, not that its
//     machine is public, so a name answered with a private IPv4 network's address (a company's DNS
//     answering inside) is never handed on; and what failed by a name (a TLS error, the proxy's status) is
//     the log's alone, the block told one why for all, so that it learns nothing of what answers at an
//     address its author's DNS gave. Refused, code "private", its why naming the host, the address and
//     why: an http address (no TLS to guard it), an IP written in the address, localhost and the names
//     under it, a private network's address, no proxy, a proxy of another machine (its address the log's
//     alone). A proxy that is not running is passed over for the same address direct, checked again for
//     that: a fake-ip address, or a name the proxy was to reach, is then refused;
//   - a redirect is followed here, HOPS at most, each hop's address held to all of the above but the rate
//     (another host must be one of the block's needs the reader allowed too; a Location that does not
//     parse, or is no address a block may ask for, is code "url" as a block's own address is, its why
//     naming its scheme and host alone);
//   - the network not reached (no network, a name that does not resolve, a site that does not answer, a
//     timeout): the answer kept, whatever its age (cached: true), or code "offline".
// Any refusal after the address is checked (the network, the site's answer, a redirect) gives the answer
// kept where there is one, which is what the block showed before; one that is given has the key written
// back as `{key}` wherever what the site said held it (keyless), the log's line too. Each answer is kept
// by the address the block asked for, `{key}` unfilled (./net-cache.mjs), in memory and in
// .gallery/cache/net/, with the document that asked, for an export of it to embed.

/** The most bytes an answer may have, unpacked. */
export const LIMIT = 512 * 1024;
/** How long an answer is given again without fetching, in ms. */
export const FRESH = 60_000;
/** How many fetches a block may make in a minute. */
export const RATE = 20;
/** How many redirects one ask follows. */
export const HOPS = 5;
/** How long one ask may take, all its hops, in ms. */
export const TIMEOUT = 10_000;
const BODY = 16 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
// A JSON type (application/json, application/<x>+json, text/json) or a text one; the parameters aside.
const READABLE = /^(?:application\/(?:[\w.-]+\+)?json|text\/[\w.+-]+)$/i;

const refused = (code, fields = {}) => ({ ok: false, code, ...fields });
// A refusal on the way (a hop, the answer), which the route gives as its own; `detail`, what the server's
// log says in place of its why (the proxy's address, what failed by a name: never the block's to read).
const stop = (code, fields = {}, detail) => Object.assign(new Error(code), { refusal: refused(code, fields), ...(detail === undefined ? {} : { detail }) });

/**
 * Where a redirect goes: its Location read against the address it answered (`from`), as addressOf reads
 * a block's ({ url }), or { code: "url", why } (an address that does not parse, or none a block may ask
 * for: another port, a user in it, not http or https). The why names its scheme and host alone (the
 * port with it): what follows may hold the key the server wrote in (a site that sends its query on), and
 * the why is told to the page and the log.
 */
function redirectOf(location, from) {
  let target;
  try {
    target = new URL(location, from);
  } catch {
    return { code: "url", why: "a redirect to an address that does not parse" };
  }
  const next = addressOf(target.href);
  return next.code ? { code: "url", why: `a redirect to ${target.host ? `${target.protocol}//${target.host}` : target.protocol}: ${next.why}` } : next;
}

/** A refusal with no string of it holding `key` (as written or as an address encodes it): `{key}` there. */
function keyless(refusal, key) {
  const forms = [...new Set([key, encodeURIComponent(key)])].filter(Boolean);
  const clean = (value) => (typeof value === "string" ? forms.reduce((text, form) => text.split(form).join("{key}"), value) : value);
  return Object.fromEntries(Object.entries(refusal).map(([name, value]) => [name, clean(value)]));
}

/** dns.lookup's addresses of `host`, all of them, as the system gives them. */
const lookup = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

// A proxy as a refusal's why names it: its host and port (never a user or password in its URL).
const proxyName = (proxy) => URL.parse(proxy)?.host || "?";
// What an address that is none of the public internet is, as a refusal's why says it.
const whatIs = (address) => (addressKind(address) === "fake-ip" ? "an address a fake-ip proxy's DNS gives" : "an address of this computer or of a private network");

/**
 * The machine a hop's `url` is to be reached at, `proxy` the one it goes through (a URL or null):
 * { address } (its host's one address of the public internet, or of 198.18.0.0/15 where that proxy is a
 * program of this computer: a fake-ip one), { address: null, resolved, said } (an https address whose
 * name resolves here to addresses of this computer or unique-local ones, `resolved` one of them, while
 * that proxy is a program of this computer: its name handed to it, TLS the guard), or a refusal
 * ("private" with the host, the address that is not and a why naming both, a private network's address
 * first; "offline" for a name that does not resolve).
 */
async function machineOf(url, { resolve, proxy }) {
  const host = url.hostname;
  const here = proxyHere(proxy);
  const reachable = (address) => {
    const kind = addressKind(address);
    return kind === "public" || (kind === "fake-ip" && here);
  };
  const literal = host.replace(/^\[|\]$/g, "");
  if (addressKind(literal) !== "none") {
    if (reachable(literal)) return { address: literal };
    throw stop("private", { host, address: literal, why: `${literal} is ${whatIs(literal)}` });
  }
  let addresses;
  try {
    addresses = (await resolve(host)).map((found) => (typeof found === "string" ? found : found.address));
  } catch (error) {
    throw stop("offline", { why: `${host} did not resolve (${error.code ?? error.message})` });
  }
  if (addresses.length === 0) throw stop("offline", { why: `${host} did not resolve` });
  const wrongs = addresses.filter((address) => !reachable(address));
  if (wrongs.length === 0) return { address: addresses[0] };
  // The address said: one of a private network where there is one (what keeps the name from the proxy),
  // an IPv4 one where there is one (127.129.1.73 says more than fd00:…).
  const foreign = wrongs.filter((address) => !mapsHere(address));
  const among = foreign.length ? foreign : wrongs;
  const wrong = among.find((address) => !address.includes(":")) ?? among[0];
  const said = `${host} resolved to ${wrong}, ${whatIs(wrong)}`;
  const why = keptHere(host) ? "and its name is one kept for this computer (localhost)"
    : !proxy ? "and no proxy of this computer goes between to reach it by its name"
    : !here ? "and the proxy it goes through is not on this computer"
    : url.protocol !== "https:" ? "and an http address is never handed to a proxy by its name (no TLS to check the site)"
    : foreign.length ? "and a private network's address is never handed to a proxy by its name (that network's own machines are there)"
    : null;
  if (why === null) return { address: null, resolved: wrong, said };
  // The proxy's address goes to the log alone: a block reads the why, and a company's proxy is none of its business.
  throw stop("private", { host, address: wrong, why: `${said}, ${why}` }, here || !proxy || keptHere(host) ? undefined : `${said}, and the proxy it goes through (${proxyName(proxy)}) is not on this computer`);
}

/**
 * One hop of a checked ask, as the server makes it: `url`'s host resolved and checked, the request made
 * to that address, through the system's proxy or direct (`proxyFor(url)`: its URL or null), or its name
 * handed to that proxy (machineOf); `connect` and `ca` as fetchPinned's (a test's).
 */
export const pinnedHop = ({ resolve = lookup, proxyFor = systemProxy, connect, ca } = {}) => async (url, { headers, signal }) => {
  const proxy = await proxyFor(url.href);
  const machine = await machineOf(url, { resolve, proxy });
  const { address } = machine;
  const own = { ...(connect ? { connect } : {}), ...(ca ? { ca } : {}) };
  try {
    return await fetchPinned(url, { address, proxy, headers, signal, ...own });
  } catch (error) {
    // By its name the proxy is not running only where nothing took the connection (one that hangs up as
    // it fails to reach the name is running, and is told as any failure is).
    if (!(proxy && error.proxyFailed && (address !== null || error.code === "ECONNREFUSED"))) {
      // By its name, what failed is the log's alone (a TLS error, the proxy's status, a reset): told the
      // block, it would say what answers at port 443 of a private address its author's DNS gave.
      if (address === null && !signal?.aborted) throw stop("offline", { why: `${machine.said}, and no site the proxy of this computer reached by its name proved to be it` }, `${machine.said}, handed by its name to the proxy (${proxyName(proxy)}): ${error.code ?? error.message}`);
      throw error;
    }
    // The proxy is not running: the same address direct, checked again for it (no proxy maps a fake-ip
    // one, nor reaches a name the resolver here gave no public address for).
    const stopped = (named) => `and the proxy of this computer that would reach it${named ? ` (${proxyName(proxy)})` : ""} is not running`;
    const said = address === null ? machine.said : `${url.hostname.replace(/^\[|\]$/g, "") === address ? address : `${url.hostname} resolved to ${address}`}, ${whatIs(address)}`;
    if (address === null || addressKind(address) !== "public") throw stop("private", { host: url.hostname, address: address ?? machine.resolved, why: `${said}, ${stopped(false)}` }, `${said}, ${stopped(true)}`);
    return fetchPinned(url, { address, proxy: null, headers, signal, ...own });
  }
};

/**
 * The scenarios' hop (GALLERY_TEST_NET=<port>: src/server/routes.mjs): every hop to the server of this
 * computer at `port`, as plain http, the address it stands for in its path (/<scheme>/<host><path>?<query>),
 * nothing resolved and no proxy: the browser scenarios reach no other machine, and the checks of names
 * and addresses are the unit tests' (tests/unit/net-route.mjs).
 */
export const localHop = (port) => (url, { headers, signal }) => fetchPinned(new URL(`http://127.0.0.1:${port}/${url.protocol.slice(0, -1)}/${url.host}${url.pathname}${url.search}`), { address: "127.0.0.1", headers, signal });

// A request's body, at most BODY bytes, as JSON.
async function bodyOf(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY) throw Object.assign(new Error("too-large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// What a type's charset is read with: its own where the platform knows it, else UTF-8.
function textOf(bytes, type) {
  const label = /;\s*charset="?([^";]+)"?/i.exec(type)?.[1];
  try {
    return new TextDecoder(label || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * The route for workspace `root`: { handle(request, response), answer(body) (the answer to an ask, for
 * the tests), cache }. `catalog()`: the catalog in use; `hop(url, { headers, signal })`: one request, its
 * address checked first (pinnedHop's with the system's resolver and proxy, or a test's); `now()`: the clock.
 */
export function createNetRoute({ root, catalog = () => currentCatalog(root), hop = null, now = Date.now, cache = createNetCache(root), log = () => {} }) {
  const reach = hop ?? pinnedHop();
  const fetches = new Map(); // a block's id -> when its fetches of the last minute were made
  const takeTurn = (id) => {
    const at = now();
    const recent = (fetches.get(id) ?? []).filter((time) => at - time < 60_000);
    if (recent.length >= RATE) {
      fetches.set(id, recent);
      return false;
    }
    fetches.set(id, [...recent, at]);
    return true;
  };
  const headers = { accept: "application/json, text/plain;q=0.9, text/*;q=0.8", "user-agent": `Gallery/${galleryVersion} (a custom block's card)` };

  // The ask followed hop by hop, each held to the block's hosts the reader allowed: the answer's { type, text }.
  async function fetchChecked(start, { hosts, allowed, key }) {
    const signal = AbortSignal.timeout(TIMEOUT);
    let url = start;
    for (let hops = 0; ; hops++) {
      let response;
      try {
        response = await reach(key === undefined ? url : new URL(withKey(url.href, key)), { headers, signal });
      } catch (error) {
        if (error.refusal) throw error;
        throw stop("offline", { why: signal.aborted ? `no answer within ${TIMEOUT / 1000} s` : String(error.code ?? error.message) });
      }
      if (REDIRECTS.has(response.status) && response.headers.get("location")) {
        response.body?.cancel().catch(() => {});
        if (hops >= HOPS) throw stop("status", { status: response.status, why: `more than ${HOPS} redirects` });
        const next = redirectOf(response.headers.get("location"), url);
        if (next.code) throw stop("url", { why: next.why });
        const need = hostIn(next.url.hostname, hosts);
        if (!need) throw stop("host", { host: next.url.hostname, why: `a redirect to ${next.url.hostname}, which the block's needs do not name` });
        if (!allowed.includes(need)) throw stop("consent", { hosts: hosts.filter((host) => !allowed.includes(host)) });
        url = next.url;
        key = keyIn(url.href) ? key : undefined;
        continue;
      }
      if (response.status < 200 || response.status > 299) {
        response.body?.cancel().catch(() => {});
        throw stop("status", { status: response.status });
      }
      const type = response.headers.get("content-type") ?? "";
      const bare = type.split(";")[0].trim();
      if (bare && !READABLE.test(bare)) {
        response.body?.cancel().catch(() => {});
        throw stop("type", { type: bare });
      }
      if (Number(response.headers.get("content-length")) > LIMIT) {
        response.body?.cancel().catch(() => {});
        throw stop("too-large", { limit: LIMIT });
      }
      let bytes;
      try {
        bytes = response.body ? await readWhole(response, LIMIT) : Buffer.alloc(0);
      } catch (error) {
        throw stop("offline", { why: String(error.code ?? error.message) });
      }
      if (bytes === null) throw stop("too-large", { limit: LIMIT });
      return { type: bare || "text/plain", text: textOf(bytes, type) };
    }
  }

  // What an ask of a block's is answered: data as it asked for it, or a refusal.
  const given = (entry, as, cached) => {
    const data = dataOf(entry, as);
    return data === undefined ? refused("type", { why: "the answer is no JSON" }) : { ok: true, data, at: entry.at, cached };
  };

  async function answer(body) {
    const { block: id, url: raw, as = "json", doc = null } = body ?? {};
    const found = typeof id === "string" ? catalog().packages.get(id) : null;
    if (!found) return refused("missing", { why: "no custom block of that id loads in this workspace" });
    const hosts = netHostsOf(found.needs);
    if (as !== "json" && as !== "text") return refused("url", { why: 'as is "json" or "text"' });
    const address = addressOf(raw);
    if (address.code) return refused("url", { why: address.why });
    const { url } = address;
    const need = hostIn(url.hostname, hosts);
    if (!need) return refused("host", { host: url.hostname, why: hosts.length ? `its needs name ${hosts.join(", ")}` : "its needs name no host of the net" });
    const allowed = catalog().settings.net?.[id] ?? [];
    if (!allowed.includes(need)) return refused("consent", { hosts: hosts.filter((host) => !allowed.includes(host)) });
    let key;
    if (keyIn(url.href)) {
      const keys = readKeys(root);
      key = keys[url.hostname] ?? keys[need];
      if (key === undefined) return refused("key", { host: url.hostname });
    }
    const name = url.href;
    const kept = cache.get(name);
    cache.used(name, doc, as);
    if (kept && now() - Date.parse(kept.at) < FRESH) return given(kept, as, true);
    if (!takeTurn(id)) return kept ? given(kept, as, true) : refused("rate", { why: `more than ${RATE} fetches in a minute` });
    try {
      const { type, text } = await fetchChecked(url, { hosts, allowed, key });
      return given(cache.put(name, { type, text, at: new Date(now()).toISOString() }), as, false);
    } catch (error) {
      if (!error.refusal) throw error;
      if (kept && error.refusal.code !== "consent") return given(kept, as, true);
      // What the site said (its Location, its type) may hold the key it was sent: never the page's or the log's.
      const refusal = key === undefined ? error.refusal : keyless(error.refusal, key);
      // The log says the detail where there is one (an offline by a name too), the page the why.
      const told = error.detail === undefined ? refusal.why : key === undefined ? error.detail : keyless({ why: error.detail }, key).why;
      if (refusal.code !== "offline" || error.detail !== undefined) log(`${id}: ${url.hostname} refused (${refusal.code}${told ? `: ${told}` : ""})`);
      return refusal;
    }
  }

  async function handle(request, response) {
    if (request.method !== "POST") return sendJson(response, 405, { ok: false, reason: "method" });
    if (request.headers.origin !== `http://${request.headers.host}`) return sendJson(response, 403, { ok: false, reason: "origin" });
    if (!/^application\/json\b/i.test(request.headers["content-type"] ?? "")) return sendJson(response, 415, { ok: false, reason: "type" });
    let body;
    try {
      body = await bodyOf(request);
    } catch (error) {
      return sendJson(response, error.status ?? 400, { ok: false, reason: "body" });
    }
    try {
      return sendJson(response, 200, await answer(body));
    } catch (error) {
      return sendJson(response, 500, { ok: false, code: "offline", why: error.message });
    }
  }

  return { handle, answer, cache };
}
