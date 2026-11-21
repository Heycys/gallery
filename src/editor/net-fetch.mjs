import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// The fetch the server reaches the web with (a bookmark's page and pictures, whether a page lets
// frames show it, a picture given by its link): through the proxy this computer's browser goes
// through. The pages are fetched by this computer, not by a server elsewhere, and Node's own fetch
// takes no proxy, so a site that blocks some regions (403 "Not available in your region") left a
// bookmark with its address alone.
// The proxy, the first there is:
//   1. HTTPS_PROXY / HTTP_PROXY / ALL_PROXY (either case), hosts in NO_PROXY going direct;
//   2. Windows: Internet Options' proxy (ProxyEnable / ProxyServer, ProxyOverride going direct);
//   3. macOS: scutil --proxy (HTTPSEnable / HTTPSProxy / HTTPSPort, ExceptionsList going direct).
// The system's is read again every 30s (a proxy switched on or off needs no restart). This computer
// and the local network always go direct. Only HTTP proxies (the "system proxy" of Clash, v2rayN).
// Through a proxy: Node's http / https / tls (no dependency): an https address through a CONNECT
// tunnel, an http one sent whole to the proxy; redirects followed (10 at most), gzip / deflate / br
// unpacked, a standard Response (its url where the redirects ended). A proxy that cannot be reached
// (not running) is passed over for a direct fetch; a timeout (the caller's signal) is not retried.

const run = promisify(execFile);
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.0\.0\.0)/i;

// Hosts that go direct: NO_PROXY's (comma separated, ".example.com" or "example.com" with its
// subdomains, "*" all), Windows' ProxyOverride (semicolons, * a wildcard, <local> a name with no dot).
function bypassed(host, rules) {
  const name = host.toLowerCase();
  for (const raw of rules) {
    const rule = raw.trim().toLowerCase();
    if (!rule) continue;
    if (rule === "*") return true;
    if (rule === "<local>") {
      if (!name.includes(".")) return true;
      continue;
    }
    if (rule.includes("*")) {
      if (new RegExp(`^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(name)) return true;
      continue;
    }
    const bare = rule.replace(/^\./, "").replace(/:\d+$/, "");
    if (name === bare || name.endsWith(`.${bare}`)) return true;
  }
  return false;
}

const withScheme = (address) => (/^[a-z]+:\/\//i.test(address) ? address : `http://${address}`);

function environmentProxy(env = process.env) {
  const url = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy;
  return url ? { url: withScheme(url), bypass: (env.NO_PROXY || env.no_proxy || "").split(",") } : null;
}

// Windows: ProxyServer is "host:port", or by protocol "http=h:p;https=h:p;socks=h:p".
async function windowsProxy() {
  const { stdout } = await run("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { windowsHide: true, timeout: 3000 });
  const value = (name) => new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, "mi").exec(stdout)?.[1]?.trim();
  if (Number.parseInt(value("ProxyEnable") || "0", 16) !== 1) return null;
  const server = value("ProxyServer");
  if (!server) return null;
  let target = server;
  if (server.includes("=")) {
    const parts = Object.fromEntries(server.split(";").map((part) => part.split("=").map((each) => each.trim())));
    target = parts.https || parts.http;
    if (!target) return null;
  }
  return { url: withScheme(target), bypass: (value("ProxyOverride") || "").split(";") };
}

async function macProxy() {
  const { stdout } = await run("scutil", ["--proxy"], { timeout: 3000 });
  const value = (name) => new RegExp(`\\b${name}\\s*:\\s*(\\S+)`).exec(stdout)?.[1];
  if (value("HTTPSEnable") !== "1" || !value("HTTPSProxy")) return null;
  const exceptions = [...stdout.matchAll(/^\s*\d+\s*:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  return { url: `http://${value("HTTPSProxy")}:${value("HTTPSPort") || 80}`, bypass: exceptions };
}

let cached = null;
let cachedAt = 0;
async function systemProxy() {
  const fromEnvironment = environmentProxy();
  if (fromEnvironment) return fromEnvironment;
  if (cached !== null && Date.now() - cachedAt < 30000) return cached || null;
  let found = null;
  try {
    if (process.platform === "win32") found = await windowsProxy();
    else if (process.platform === "darwin") found = await macProxy();
  } catch {
    found = null;
  }
  cached = found || false;
  cachedAt = Date.now();
  return found;
}

/** The proxy `url` goes through, or null (direct). Only an http or https address goes to a proxy: a data: one (a site's icon written in its page) is read as it is. */
export async function proxyFor(url) {
  let host;
  try {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    host = target.hostname;
  } catch {
    return null;
  }
  if (LOCAL.test(host)) return null;
  const proxy = await systemProxy();
  return proxy && !bypassed(host, proxy.bypass) && /^http:/i.test(proxy.url) ? proxy.url : null;
}

// ---------- one request through an HTTP proxy ----------

const proxyAuthorization = (proxy) => (proxy.username
  ? { "proxy-authorization": `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}` }
  : {});

// An https address: a CONNECT to the proxy, the socket it opens.
function tunnel(proxy, host, port, signal) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: proxy.hostname, port: proxy.port || 80, method: "CONNECT", path: `${host}:${port}`, headers: { host: `${host}:${port}`, ...proxyAuthorization(proxy) }, signal });
    request.once("connect", (response, socket) => {
      if (response.statusCode === 200) resolve(socket);
      else {
        socket.destroy();
        reject(Object.assign(new Error(`the proxy answered ${response.statusCode}`), { proxyAnswered: response.statusCode }));
      }
    });
    request.once("error", reject);
    request.end();
  });
}

function requestOnce(url, { method, headers, signal }, proxyUrl) {
  const target = new URL(url);
  const proxy = new URL(proxyUrl);
  const head = { "accept-encoding": "gzip, deflate, br", ...headers };
  return new Promise((resolve, reject) => {
    const send = (request) => {
      request.once("response", resolve);
      request.once("error", reject);
      request.end();
    };
    if (target.protocol === "http:") {
      send(http.request({ host: proxy.hostname, port: proxy.port || 80, method, path: target.href, headers: { ...head, host: target.host, ...proxyAuthorization(proxy) }, signal }));
      return;
    }
    tunnel(proxy, target.hostname, target.port || 443, signal).then((socket) => {
      send(https.request(target, { method, headers: { ...head, host: target.host }, defaultPort: 443, signal, createConnection: () => tls.connect({ socket, servername: target.hostname, ALPNProtocols: ["http/1.1"] }) }));
    }, reject);
  });
}

// Node's answer as a standard Response: unpacked, its url where the redirects ended.
function toResponse(answer, url) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(answer.headers)) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  const encoding = (answer.headers["content-encoding"] || "").toLowerCase();
  const decode = { gzip: zlib.createGunzip, "x-gzip": zlib.createGunzip, deflate: zlib.createInflate, br: zlib.createBrotliDecompress }[encoding];
  const stream = decode ? answer.pipe(decode()) : answer;
  if (decode) {
    answer.on("error", (error) => stream.destroy(error));
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  const empty = [101, 204, 205, 304].includes(answer.statusCode);
  if (empty) answer.resume();
  const response = new Response(empty ? null : Readable.toWeb(stream), { status: answer.statusCode, statusText: answer.statusMessage, headers });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

async function proxiedFetch(url, { method = "GET", headers = {}, signal } = {}, proxy) {
  for (let hops = 0; ; hops++) {
    const answer = await requestOnce(url, { method, headers, signal }, proxy);
    const location = answer.headers.location;
    if ([301, 302, 303, 307, 308].includes(answer.statusCode) && location && hops < 10) {
      answer.resume();
      url = new URL(location, url).href;
      if (answer.statusCode === 303) method = "GET";
      continue;
    }
    return toResponse(answer, url);
  }
}

// ---------- one request to an address checked before (a custom block's: src/server/net-route.mjs) ----------

// An IPv6 address as a host of an address or a CONNECT's target: in brackets.
const hostOf = (address) => (address.includes(":") ? `[${address}]` : address);
const isAddress = (name) => /^[\d.]+$/.test(name) || name.includes(":");

/**
 * One GET of `url` (a URL) at the machine `address` (an IP address the caller checked: no name is
 * resolved here, so that what was checked is what is reached), its redirects not followed (the caller
 * checks where each goes), through `proxy` (an http proxy's URL, or null: direct) by a CONNECT to that
 * address (an https address) or the address in the request's own (an http one), the host's name kept
 * for TLS (its certificate is held to it) and the Host header. `address` null hands the name itself to
 * `proxy` (a CONNECT to <name>:<port>, an https address alone), which resolves it: TLS is then what
 * checks the machine, its certificate held to the name against the public CAs alone (tls.rootCertificates,
 * not NODE_EXTRA_CA_CERTS' nor the system's, `ca` besides), whatever NODE_TLS_REJECT_UNAUTHORIZED says. Through a proxy, TLS is done before the
 * request is handed its socket, so that nothing of it goes to a machine whose certificate failed.
 * `connect(host, port)`: the socket a direct request goes out on (net.connect's, a test's own); `ca`: the
 * certificates TLS trusts besides the system's (a test's own). Its Response (unpacked as netFetch's); a
 * proxy that cannot be reached throws with `proxyFailed` (the caller may go direct, checked again for
 * that), one that answers the CONNECT with another status than 200 with `proxyAnswered`.
 */
export function fetchPinned(url, { address, proxy = null, headers = {}, signal, connect = (host, port) => net.connect({ host, port }), ca = null }) {
  const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
  const byName = address === null;
  if (byName && !(proxy && url.protocol === "https:")) return Promise.reject(new Error("fetchPinned: only an https address is handed to a proxy by its name"));
  const servername = isAddress(url.hostname) ? undefined : url.hostname;
  const head = { "accept-encoding": "gzip, deflate, br", ...headers, host: url.host };
  const path = `${url.pathname}${url.search}`;
  const roots = byName || ca ? [...tls.rootCertificates, ...(ca ? [ca] : [])] : null;
  // By its name the certificate is checked whatever NODE_TLS_REJECT_UNAUTHORIZED says ("0" turns Node's
  // default off): it is all that guards that path.
  const secure = (socket) => tls.connect({ socket, servername, ALPNProtocols: ["http/1.1"], ...(roots ? { ca: roots } : {}), ...(byName ? { rejectUnauthorized: true } : {}) });
  // TLS over a proxy's tunnel, the socket once its handshake is done and its certificate checked.
  const secured = (socket) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      socket.destroy();
      return reject(signal.reason);
    }
    const tlsSocket = secure(socket);
    const abort = () => tlsSocket.destroy(signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    tlsSocket.on("error", (error) => {
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    tlsSocket.once("close", () => reject(new Error("the connection closed before TLS was done"))); // nothing once resolved
    tlsSocket.once("secureConnect", () => {
      signal?.removeEventListener("abort", abort);
      if (byName && !tlsSocket.authorized) {
        const error = Object.assign(new Error(`the certificate failed (${tlsSocket.authorizationError})`), { code: String(tlsSocket.authorizationError) });
        tlsSocket.destroy();
        return reject(error);
      }
      resolve(tlsSocket);
    });
  });
  return new Promise((resolve, reject) => {
    const send = (options) => {
      const request = (url.protocol === "https:" ? https : http).request({ method: "GET", signal, ...options }); // no agent: createConnection is the socket
      request.once("response", (answer) => resolve(toResponse(answer, url.href)));
      request.once("error", reject);
      request.end();
    };
    if (!proxy) {
      send({ host: address, port, path, headers: head, createConnection: () => (url.protocol === "https:" ? secure(connect(address, port)) : connect(address, port)) });
      return;
    }
    const through = new URL(proxy);
    const failed = (error) => reject(error?.proxyAnswered || signal?.aborted ? error : Object.assign(error ?? new Error("the proxy was not reached"), { proxyFailed: true }));
    if (url.protocol === "http:") {
      const request = http.request({ host: through.hostname, port: through.port || 80, method: "GET", path: `http://${hostOf(address)}:${port}${path}`, headers: { ...head, ...proxyAuthorization(through) }, agent: false, signal });
      request.once("response", (answer) => resolve(toResponse(answer, url.href)));
      request.once("error", failed);
      request.end();
      return;
    }
    tunnel(through, byName ? url.hostname : hostOf(address), port, signal).then(
      (socket) => secured(socket).then((tlsSocket) => send({ host: byName ? url.hostname : address, port, path, headers: head, createConnection: () => tlsSocket }), reject),
      failed,
    );
  });
}

/** fetch(url, init) through this computer's proxy (init: method, headers, signal; redirects always followed). */
export async function netFetch(url, init = {}) {
  const proxy = await proxyFor(url);
  if (proxy) {
    try {
      return await proxiedFetch(url, init, proxy);
    } catch (error) {
      if (init.signal?.aborted) throw error; // a timeout: no direct try after it
      // The proxy not running or not reached: a direct try.
    }
  }
  return fetch(url, init);
}

// ---------- a web address, as every reader of one asks for it ----------

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/**
 * A web address fetched as a browser would (http or https only, or the `protocols` given, redirects followed, a browser's
 * user agent, `timeout` ms), by every reader of one: a page's bookmark and its pictures, whether a
 * page lets frames show it, a picture or file given by its link. Its Response, whatever its status
 * (the caller reads it, and `readLimited`/`readWhole` take its body); throws with a `reason`:
 * "url" (not an http(s) address) or "download" (not reached, with `unreachable` as its message).
 */
export async function fetchWeb(target, { timeout = 10000, accept = "*/*", headers = {}, unreachable = "打不开这个网页", protocols = ["http:", "https:"] } = {}) {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw Object.assign(new Error("不是网址"), { reason: "url" });
  }
  if (!protocols.includes(url.protocol)) throw Object.assign(new Error("只支持 http(s) 网址"), { reason: "url" });
  return netFetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeout), headers: { "user-agent": UA, accept, ...headers } })
    .catch(() => { throw Object.assign(new Error(unreachable), { reason: "download" }); });
}

/** At most `limit` bytes of a response's body (the rest is not read). */
export async function readLimited(response, limit) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    size += value.length;
    if (size >= limit) {
      reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks);
}

/** A response's whole body, or null when it is more than `limit` bytes (read no further than that). */
export async function readWhole(response, limit) {
  const bytes = await readLimited(response, limit + 1);
  return bytes.length <= limit ? bytes : null;
}
