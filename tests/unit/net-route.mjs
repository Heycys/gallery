import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createNetRoute, FRESH, HOPS, LIMIT, RATE, pinnedHop } from "../../src/server/net-route.mjs";
import { scriptExportProblems } from "../../src/render/package-files.mjs";
import { usesIn, NETWORK } from "../../src/render/typecheck.mjs";
import { netSnapshot } from "../../src/shared/net-cache.mjs";
import { writeKey } from "../../src/shared/net-keys.mjs";
import { addressKind, addressOf, hostMatches, keptHere, keyIn, mapsHere, proxyHere, withKey } from "../../src/shared/net-policy.mjs";

// A custom block online (decided 2026-11-07; src/server/net-route.mjs,
// src/shared/net-policy.mjs): the route's policy, each part of it against servers of this computer and a
// resolver of the test's, never the real network. The machine a name stands for is the resolver's
// answer, a public address of the documents' (93.184.216.34) dialed to a local server by the test's
// connect, so that what the transport dials is what was checked: a private address, a redirect, a DNS
// rebinding, a proxy (an http address named in the request, an https one by a CONNECT to the checked
// address with TLS held to the host's name), an oversized answer, no consent and offline each have a
// test of their own, and so do the cache, the rate, the key, the request's shape, the export's snapshot
// and the static scan that lets context.fetch through and keeps the bare fetch out.

const PUBLIC = "93.184.216.34";
const OTHER = "93.184.216.35";
const tlsDirectory = path.join(import.meta.dirname, "fixtures", "net-tls");
const cert = fs.readFileSync(path.join(tlsDirectory, "cert.pem"));
const key = fs.readFileSync(path.join(tlsDirectory, "key.pem"));

// ---------- the policy's pure parts ----------

for (const [address, kind] of [
  ["93.184.216.34", "public"], ["8.8.8.8", "public"], ["1.1.1.1", "public"],
  ["127.0.0.1", "private"], ["127.8.9.10", "private"], ["10.0.0.5", "private"], ["172.16.0.1", "private"], ["172.31.255.255", "private"], ["172.32.0.1", "public"],
  ["192.168.1.1", "private"], ["169.254.169.254", "private"], ["100.64.0.1", "private"], ["0.0.0.0", "private"], ["224.0.0.1", "private"], ["255.255.255.255", "private"],
  ["192.0.2.1", "private"], ["198.51.100.7", "private"], ["203.0.113.9", "private"],
  ["198.18.0.1", "fake-ip"], ["198.19.255.254", "fake-ip"], ["198.20.0.1", "public"],
  ["::1", "private"], ["::", "private"], ["fe80::1", "private"], ["fe80::1%eth0", "private"], ["fc00::1", "private"], ["fd12:3456::1", "private"], ["ff02::1", "private"],
  ["::ffff:127.0.0.1", "private"], ["::ffff:10.1.2.3", "private"], ["::ffff:93.184.216.34", "public"], ["::ffff:7f00:1", "private"], ["64:ff9b::a00:1", "private"], ["64:ff9b::5db8:d822", "public"],
  ["2002:0a00:0001::1", "private"], ["2002:5db8:d822::1", "public"], ["2001:db8::1", "private"], ["2606:4700:4700::1111", "public"], ["[2606:4700:4700::1111]", "public"],
  ["example.com", "none"], ["1.2.3", "none"], ["300.1.1.1", "none"], ["1::2::3", "none"],
]) assert.equal(addressKind(address), kind, `${address} is ${kind}`);
assert.deepEqual(["*.example.com", "example.com"].map((pattern) => ["a.example.com", "example.com", "badexample.com", "a.b.example.com"].filter((host) => hostMatches(host, pattern))), [["a.example.com", "a.b.example.com"], ["example.com"]], "*. is any name under it, never the name itself");
assert.deepEqual(["http://127.0.0.1:7890", "http://localhost:7890", "http://[::1]:7890", "http://10.0.0.2:7890", "http://proxy.example.com:80", null].map(proxyHere), [true, true, true, false, false, false], "a proxy of this computer is what a fake-ip answer goes to");
assert.deepEqual(["localhost", "app.localhost", "a.b.LOCALHOST", "localhost.", "notlocalhost", "localhost.example.com", "api.example.com"].map(keptHere), [true, true, true, true, false, false, false], "localhost and the names under it are kept for this computer");
assert.deepEqual(["127.129.1.73", "127.0.0.1", "::1", "::ffff:127.0.0.2", "fd00:696e:6974:6578::29:14a", "fc12::1", "10.1.2.3", "172.16.0.9", "192.168.1.20", "100.64.0.1", "169.254.169.254", "fe80::1", "0.0.0.0", "::", "::ffff:10.0.0.1", "8.8.8.8"].map(mapsHere), [true, true, true, true, true, true, false, false, false, false, false, false, false, false, false, false], "what a proxy of this computer that maps names answers: this computer's and unique-local addresses, never a private IPv4 network's");
for (const [raw, code] of [["https://api.example.com/v1?q=1", undefined], ["http://api.example.com/", undefined], ["ftp://api.example.com/", "url"], ["https://api.example.com:8443/", "url"], ["https://user:pw@api.example.com/", "url"], ["/v1/forecast", "url"], [42, "url"], [`https://api.example.com/${"x".repeat(5000)}`, "url"]]) {
  assert.equal(addressOf(raw).code, code, `${String(raw).slice(0, 40)}: ${code ?? "an address"}`);
}
assert.equal(addressOf("https://api.example.com/a#part").url.href, "https://api.example.com/a", "a fragment is no part of what is asked for");
assert.equal(addressOf("https://api.example.com:443/a").url.href, "https://api.example.com/a", "the scheme's own port written is its port");
assert.ok(keyIn("https://api.example.com/latest?apikey={key}") && keyIn(new URL("https://api.example.com/v6/{key}/latest").href) && !keyIn("https://api.example.com/latest"), "{key}, as written and as a path encodes it");
assert.equal(withKey(new URL("https://api.example.com/v6/{key}/x?k={key}").href, "a b/c"), "https://api.example.com/v6/a%20b%2Fc/x?k=a%20b%2Fc", "the key written in, encoded");

// ---------- the static scan: context.fetch goes through, the bare fetch does not ----------

const REFUSED = new Set([...NETWORK, "eval", "Function"]);
assert.deepEqual(usesIn("DocKit.component({ id: 'a/b', mount(host, context) { context.fetch('https://api.example.com/'); } });", REFUSED), [], "context.fetch is the context's, no global");
assert.deepEqual(usesIn("DocKit.component({ id: 'a/b', async mount(host, { fetch }) { await fetch('https://api.example.com/'); } });", REFUSED), [], "nor what a mount takes of its context by that name");
assert.deepEqual(usesIn("const go = (context) => context.fetch(url, { as: 'text' }).then((answer) => answer.data);", REFUSED), [], "as text, through a promise");
assert.deepEqual(usesIn("fetch('https://api.example.com/');\nwindow.fetch('x');", REFUSED).map(({ name, how }) => [name, how]), [["fetch", "call"], ["fetch", "call"]], "the global fetch is the network, which an export blocks");
{
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-net-scan-"));
  fs.writeFileSync(path.join(folder, "kit.js"), "DocKit.component({ id: 'test/rates', async mount(host, context) { const { data } = await context.fetch('https://api.example.com/latest'); host.textContent = data.rate; } });\n");
  assert.deepEqual(scriptExportProblems({ id: "test/rates", folder, files: ["kit.js"] }), [], "a package's script that fetches through its context: nothing an export refuses");
  fs.writeFileSync(path.join(folder, "kit.js"), "DocKit.component({ id: 'test/rates', async mount(host) { host.textContent = await (await fetch('https://api.example.com/latest')).text(); } });\n");
  assert.match(scriptExportProblems({ id: "test/rates", folder, files: ["kit.js"] })[0]?.what ?? "", /calls fetch\(…\): the export blocks the network/, "the bare fetch: refused");
  fs.rmSync(folder, { recursive: true, force: true });
}

// ---------- servers of this computer ----------

// Each server's sockets kept, so that closing it ends them too (a CONNECT's tunnel is no request's).
const sockets = new WeakMap();
const listen = (server) => {
  sockets.set(server, new Set());
  server.on("connection", (socket) => sockets.get(server).add(socket));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
};
const close = (server) => new Promise((resolve) => {
  server.close(() => resolve());
  for (const socket of sockets.get(server) ?? []) socket.destroy();
});

// The site: answers by its path; each request it took kept ({ method, path, host, cookie, url }).
const seen = [];
const routes = new Map();
const site = http.createServer((request, response) => {
  seen.push({ method: request.method, path: request.url, host: request.headers.host, cookie: request.headers.cookie ?? null, accept: request.headers.accept });
  const route = routes.get(request.url.split("?")[0]) ?? ((_, answer) => { answer.writeHead(404); answer.end(); });
  route(request, response);
});
const sitePort = await listen(site);
const secureSite = https.createServer({ key, cert, SNICallback: (name, done) => { secureNames.push(name); done(null, null); } }, (request, response) => site.emit("request", request, response));
const secureNames = [];
const secureSitePort = await listen(secureSite);
const json = (body, headers = {}) => (request, response) => {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(body));
};

// The proxy: an http one (Clash's system proxy), each request kept ({ kind: "connect" | "get", target });
// what it is asked for at PUBLIC (or a fake-ip address) is the site, by plain http or by its TLS one.
const proxied = [];
const toSite = (target) => (/:443$/.test(target) ? secureSitePort : sitePort);
const proxy = http.createServer((request, response) => {
  proxied.push({ kind: "get", target: request.url, host: request.headers.host });
  const upstream = http.request({ host: "127.0.0.1", port: sitePort, path: new URL(request.url).pathname + new URL(request.url).search, headers: request.headers, method: request.method }, (answer) => {
    response.writeHead(answer.statusCode, answer.headers);
    answer.pipe(response);
  });
  request.pipe(upstream);
});
proxy.on("connect", (request, socket) => {
  proxied.push({ kind: "connect", target: request.url });
  const upstream = net.connect(toSite(request.url), "127.0.0.1", () => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
const proxyPort = await listen(proxy);
const free = net.createServer();
const freePort = await listen(free);
await close(free);

// The resolver: names to addresses as the test says, each ask kept; and the dialer: an address of the
// documents' to the site of this computer (its TLS one at 443), each dial kept.
let names = {};
const asked = [];
const resolve = async (host) => {
  asked.push(host);
  const answer = typeof names[host] === "function" ? names[host]() : names[host];
  if (!answer) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
  return answer.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
};
const dialed = [];
const connect = (host, port) => {
  dialed.push(`${host}:${port}`);
  return net.connect(port === 443 ? secureSitePort : sitePort, "127.0.0.1");
};
let proxyNow = null;
const hop = pinnedHop({ resolve, proxyFor: async () => proxyNow, connect, ca: cert });

// A workspace of its own, a catalog of the test's: the block test/rates, its needs and the reader's consents.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-net-"));
fs.writeFileSync(path.join(root, "gallery.json"), `${JSON.stringify({ gallery: "workspace", version: 1 })}\n`);
const NEEDS = ["net:api.example.com", "net:*.cdn.example.com", "net:other.example.com", "net:inside.example.com", "net:10.0.0.9", "net:*.localhost"];
const settings = { net: { "test/rates": ["api.example.com", "*.cdn.example.com", "other.example.com", "inside.example.com", "10.0.0.9", "*.localhost"] } };
const catalog = () => ({ packages: new Map([["test/rates", { id: "test/rates", needs: ["workspace", ...NEEDS] }], ["test/plain", { id: "test/plain", needs: [] }]]), settings });
let clock = Date.parse("2026-11-08T08:00:00Z");
const logged = []; // what the route writes to the server's log
const route = createNetRoute({ root, catalog, hop, now: () => clock, log: (line) => logged.push(line) });
const ask = (url, more = {}) => route.answer({ block: "test/rates", url, ...more });
const fresh = () => { clock += FRESH + 1; };
const reset = () => {
  for (const list of [seen, asked, dialed, proxied, secureNames]) list.length = 0;
};

names = { "api.example.com": [PUBLIC], "other.example.com": [OTHER] };
routes.set("/v1/rate", json({ rate: 7.12 }, { "set-cookie": "session=1; Path=/" }));

// A fetch, direct: the name resolved once, the checked address dialed, the host's name as its Host, GET, no cookie.
{
  reset();
  const answer = await ask("http://api.example.com/v1/rate?base=USD", { doc: "report" });
  assert.deepEqual(answer, { ok: true, data: { rate: 7.12 }, at: "2026-11-08T08:00:00.000Z", cached: false }, "the site's JSON, as the block asked for it");
  assert.deepEqual([asked, dialed], [["api.example.com"], [`${PUBLIC}:80`]], "the name resolved once, its address dialed");
  assert.deepEqual(seen.map(({ method, path: at, host, cookie }) => [method, at, host, cookie]), [["GET", "/v1/rate?base=USD", "api.example.com", null]], "a GET, the host's name its Host, no cookie");
  assert.match(seen[0].accept, /^application\/json/, "it asks for JSON or text");
  reset();
  assert.deepEqual(await ask("http://api.example.com/v1/rate?base=USD"), { ok: true, data: { rate: 7.12 }, at: "2026-11-08T08:00:00.000Z", cached: true }, "asked again within FRESH: the answer kept");
  assert.deepEqual([asked, dialed, seen], [[], [], []], "and the network not reached");
  fresh();
  await ask("http://api.example.com/v1/rate?base=USD");
  assert.equal(seen[0]?.cookie, null, "a later fetch sends no cookie the site set");
  assert.deepEqual((await ask("http://api.example.com/v1/rate?base=USD", { as: "text" })).data, '{"rate":7.12}', "as text: the words as they came");
}

// https, direct: TLS to the checked address, its certificate held to the host's name.
{
  reset();
  fresh();
  const answer = await ask("https://api.example.com/v1/rate");
  assert.deepEqual([answer.ok, answer.data], [true, { rate: 7.12 }], "https: the site's answer");
  assert.deepEqual([dialed, secureNames], [[`${PUBLIC}:443`], ["api.example.com"]], "the checked address dialed, its name for TLS");
}

// A private address: a name that resolves to this computer or a private network, any of its addresses,
// an IP written in the address, IPv6 among them: refused, nothing dialed.
{
  for (const [addresses, said] of [[["127.0.0.1"], "this computer"], [["10.0.0.5"], "a private network"], [[PUBLIC, "192.168.1.20"], "one address among others"], [["::1"], "IPv6's loopback"], [["::ffff:127.0.0.1"], "an IPv4 one inside IPv6"], [["169.254.169.254"], "a link's (a cloud's metadata)"], [["198.18.0.9"], "a fake-ip address with no proxy of this computer"]]) {
    reset();
    fresh();
    names["inside.example.com"] = addresses;
    const answer = await ask(`http://inside.example.com/secret?${said.length}`);
    assert.equal(answer.code, "private", `${said}: refused`);
    assert.deepEqual(dialed, [], `${said}: nothing dialed`);
  }
  reset();
  assert.equal((await ask("http://10.0.0.9/admin")).code, "private", "an address written as an IP, though its needs name it");
  assert.deepEqual([asked, dialed], [[], []], "nothing resolved or dialed");
  assert.equal((await ask("http://127.0.0.1/")).code, "host", "an IP its needs do not name: not its host");
}

// A redirect: followed here, each hop's host one of the block's needs the reader allowed, its address checked.
{
  routes.set("/hop/other", (request, response) => { response.writeHead(302, { location: "http://other.example.com/v1/rate" }); response.end(); });
  routes.set("/hop/outside", (request, response) => { response.writeHead(301, { location: "http://evil.example.net/steal" }); response.end(); });
  routes.set("/hop/inside", (request, response) => { response.writeHead(307, { location: "http://inside.example.com/admin" }); response.end(); });
  routes.set("/hop/loop", (request, response) => { response.writeHead(302, { location: "/hop/loop" }); response.end(); });
  routes.set("/hop/port", (request, response) => { response.writeHead(302, { location: "http://api.example.com:8080/x" }); response.end(); });
  reset();
  assert.deepEqual((await ask("http://api.example.com/hop/other")).data, { rate: 7.12 }, "to another host of its needs: followed");
  assert.deepEqual([asked, dialed], [["api.example.com", "other.example.com"], [`${PUBLIC}:80`, `${OTHER}:80`]], "each hop resolved and dialed at its own checked address");
  reset();
  assert.deepEqual([(await ask("http://api.example.com/hop/outside")).code, asked], ["host", ["api.example.com"]], "to a host its needs do not name: refused, never resolved");
  names["inside.example.com"] = ["10.1.2.3"];
  reset();
  assert.deepEqual([(await ask("http://api.example.com/hop/inside")).code, dialed], ["private", [`${PUBLIC}:80`]], "to a host of its needs that resolves to a private network: refused at that hop");
  reset();
  const loop = await ask("http://api.example.com/hop/loop");
  assert.deepEqual([loop.code, seen.length], ["status", HOPS + 1], `a loop: given up after ${HOPS} redirects`);
  const port = await ask("http://api.example.com/hop/port");
  assert.deepEqual([port.code, port.host, port.why], ["url", undefined, "a redirect to http://api.example.com:8080: an address at another port than its scheme's: a needs' host names none"], "to another port of a host of its needs: no address a block may ask for (url, as its own would be), its scheme and host said");
  // A Location that does not parse: a refusal (url) as any hop's, never a throw (the route's 500), and the
  // answer kept given where there is one.
  let unparsed = true;
  routes.set("/hop/unparsed", (request, response) => {
    if (!unparsed) return json({ rate: 7.1 })(request, response);
    response.writeHead(302, { location: "http://exa mple.com/" });
    response.end();
  });
  assert.deepEqual([await ask("http://api.example.com/hop/unparsed?none").then(({ code, why }) => [code, why])], [["url", "a redirect to an address that does not parse"]], "a Location that does not parse, nothing kept: refused, url");
  unparsed = false;
  assert.deepEqual((await ask("http://api.example.com/hop/unparsed")).data, { rate: 7.1 }, "fetched while the site answers");
  unparsed = true;
  fresh();
  const keptOver = await ask("http://api.example.com/hop/unparsed");
  assert.deepEqual([keptOver.ok, keptOver.cached, keptOver.data], [true, true, { rate: 7.1 }], "then a Location that does not parse: the answer kept, as for any refusal after the address");
  settings.net["test/rates"] = ["api.example.com", "*.cdn.example.com", "inside.example.com", "10.0.0.9", "*.localhost"];
  fresh();
  const notAllowed = await ask("http://api.example.com/hop/other?again");
  assert.deepEqual([notAllowed.code, notAllowed.hosts], ["consent", ["other.example.com"]], "to a host of its needs the reader has not allowed: its consent");
  settings.net["test/rates"].push("other.example.com");
}

// DNS rebinding: a name that gives a public address, then this computer's. The address checked is the
// one dialed, never asked for again, and the next ask, checked anew, is refused.
{
  let turn = 0;
  names["rebind.cdn.example.com"] = () => (turn++ === 0 ? [PUBLIC] : ["127.0.0.1"]);
  routes.set("/rebind", json({ ok: "public" }));
  reset();
  const first = await ask("http://rebind.cdn.example.com/rebind");
  assert.deepEqual([first.data, asked, dialed], [{ ok: "public" }, ["rebind.cdn.example.com"], [`${PUBLIC}:80`]], "the first answer: checked and dialed, one ask of the name");
  reset();
  const second = await ask("http://rebind.cdn.example.com/rebind?second");
  assert.deepEqual([second.code, second.address, dialed], ["private", "127.0.0.1", []], "the name now this computer: refused, nothing dialed");
}

// A proxy (the system's, a program of this computer): an http address named at the checked address in
// the request, an https one by a CONNECT to that address, TLS held to the name; a fake-ip answer (Clash's
// DNS) taken only through it, and the proxy not running: the same address direct, checked again.
{
  proxyNow = `http://127.0.0.1:${proxyPort}`;
  reset();
  fresh();
  assert.deepEqual((await ask("http://api.example.com/v1/rate?via=proxy")).data, { rate: 7.12 }, "http through the proxy");
  assert.deepEqual([proxied.map(({ kind, target, host }) => [kind, target, host]), dialed], [[["get", `http://${PUBLIC}:80/v1/rate?via=proxy`, "api.example.com"]], []], "the proxy asked for the checked address, the name its Host; nothing dialed direct");
  reset();
  assert.deepEqual((await ask("https://api.example.com/v1/rate?via=proxy")).data, { rate: 7.12 }, "https through the proxy");
  assert.deepEqual([proxied.map(({ kind, target }) => [kind, target]), secureNames], [[["connect", `${PUBLIC}:443`]], ["api.example.com"]], "a CONNECT to the checked address, TLS to the name");
  names["fake.cdn.example.com"] = ["198.18.0.7"];
  routes.set("/fake", json({ via: "fake-ip" }));
  reset();
  assert.deepEqual((await ask("http://fake.cdn.example.com/fake")).data, { via: "fake-ip" }, "a fake-ip address, through a proxy of this computer: taken");
  assert.deepEqual(proxied.map(({ target }) => target), ["http://198.18.0.7:80/fake"], "handed to the proxy as it is");
  proxyNow = "http://10.20.30.40:7890";
  reset();
  assert.equal((await ask("http://fake.cdn.example.com/fake?remote")).code, "private", "a fake-ip address with a proxy of another machine: refused");
  proxyNow = `http://127.0.0.1:${freePort}`;
  reset();
  assert.deepEqual((await ask("http://api.example.com/v1/rate?via=nothing")).data, { rate: 7.12 }, "the proxy not running: direct");
  assert.deepEqual(dialed, [`${PUBLIC}:80`], "to the same checked address");
  reset();
  const down = await ask("http://fake.cdn.example.com/fake?down");
  assert.deepEqual([down.code, down.why], ["private", `fake.cdn.example.com resolved to 198.18.0.7, an address a fake-ip proxy's DNS gives, and the proxy of this computer that would reach it is not running`], "a fake-ip address with its proxy not running: refused, as no proxy maps it, the why saying so");
  assert.equal(logged.at(-1), `test/rates: fake.cdn.example.com refused (private: fake.cdn.example.com resolved to 198.18.0.7, an address a fake-ip proxy's DNS gives, and the proxy of this computer that would reach it (127.0.0.1:${freePort}) is not running)`, "the proxy's address in the log alone, never told the block");
  proxyNow = null;
}

// A name the resolver here answers with addresses of this computer or of a private network, as a proxy
// of this computer that maps names to 127.x and fd00:: addresses of its own does (found testing
// the skill with Agents, 2026-11-09: api.open-meteo.com as fd00:696e:6974:6578::29:14a and 127.129.1.73): through that proxy an
// https address is a CONNECT naming the host, which the proxy resolves, TLS held to the name and nothing
// of the request sent before it is done; refused, private, its why naming the host, the address and
// what kept it, for an http address, a name kept for this computer, no proxy, a proxy of another
// machine, one not running; a certificate for another name or of no CA trusted fails with nothing
// sent; a redirect is held to all of it.
{
  const LOOP = ["fd00:696e:6974:6578::29:14a", "127.129.1.73"];
  const local = `http://127.0.0.1:${proxyPort}`;
  const resolvedHere = "api.example.com resolved to 127.129.1.73, an address of this computer or of a private network";
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150)); // whatever a site might still be sent
  names["api.example.com"] = LOOP;
  proxyNow = local;
  reset();
  fresh();
  logged.length = 0;
  assert.deepEqual((await ask("https://api.example.com/v1/rate?by=name")).data, { rate: 7.12 }, "https, through the proxy of this computer: the site's answer");
  assert.deepEqual([proxied.map(({ kind, target }) => [kind, target]), secureNames, asked, dialed], [[["connect", "api.example.com:443"]], ["api.example.com"], ["api.example.com"], []], "a CONNECT naming the host, TLS to that name; the name resolved here once, nothing dialed direct");
  assert.deepEqual(seen.map(({ path: at, host }) => [at, host]), [["/v1/rate?by=name", "api.example.com"]], "the request, its Host the name");
  reset();
  const plain = await ask("http://api.example.com/v1/rate?by=name");
  assert.deepEqual([plain.code, plain.host, plain.address, plain.why], ["private", "api.example.com", "127.129.1.73", `${resolvedHere}, and an http address is never handed to a proxy by its name (no TLS to check the site)`], "http: refused, its why naming the host and the address (IPv4's of the two)");
  assert.deepEqual([proxied, dialed, seen], [[], [], []], "nothing asked of the proxy or dialed");
  assert.deepEqual(logged, [`test/rates: api.example.com refused (private: ${plain.why})`], "the server's log says the same");
  // The proxy's address is the log's alone: the why goes to the block, which has no business with it.
  for (const [proxyThen, said, tail, logTail] of [
    [null, "no proxy", "and no proxy of this computer goes between to reach it by its name"],
    ["http://10.20.30.40:7890", "a proxy of another machine", "and the proxy it goes through is not on this computer", "and the proxy it goes through (10.20.30.40:7890) is not on this computer"],
    [`http://127.0.0.1:${freePort}`, "the proxy not running", "and the proxy of this computer that would reach it is not running", `and the proxy of this computer that would reach it (127.0.0.1:${freePort}) is not running`],
  ]) {
    proxyNow = proxyThen;
    reset();
    const refused = await ask(`https://api.example.com/v1/rate?by=${said.length}`);
    assert.deepEqual([refused.code, refused.why], ["private", `${resolvedHere}, ${tail}`], `https, ${said}: refused`);
    assert.deepEqual([dialed, seen], [[], []], `${said}: nothing dialed, nothing sent`);
    assert.equal(logged.at(-1), `test/rates: api.example.com refused (private: ${resolvedHere}, ${logTail ?? tail})`, `${said}: the log's line`);
    assert.ok(!JSON.stringify(refused).includes(":7890") && !JSON.stringify(refused).includes(String(freePort)), `${said}: no proxy's address in what the block is told`);
  }
  proxyNow = local;
  names["app.localhost"] = ["127.0.0.1"];
  reset();
  const kept = await ask("https://app.localhost/v1/rate");
  assert.deepEqual([kept.code, kept.why, proxied], ["private", "app.localhost resolved to 127.0.0.1, an address of this computer or of a private network, and its name is one kept for this computer (localhost)", []], "a name kept for this computer: refused, never handed to the proxy");
  // A name answered with a private IPv4 network's address (a company's DNS answering inside: its machines
  // may hold a public CA's certificate), alone or beside another: refused, never handed to the proxy.
  for (const [addresses, said] of [[["10.1.2.3"], "a private network's"], [["fd00::5", "192.168.1.20"], "one beside a unique-local one"], [[PUBLIC, "172.16.0.9"], "one beside a public one"], [["100.64.0.1"], "a carrier's"]]) {
    names["corp.cdn.example.com"] = addresses;
    reset();
    const inside = await ask(`https://corp.cdn.example.com/v1/rate?${said.length}`);
    const address = addresses.find((each) => !mapsHere(each) && addressKind(each) !== "public");
    assert.deepEqual([inside.code, inside.address, inside.why, proxied, dialed, seen], ["private", address, `corp.cdn.example.com resolved to ${address}, an address of this computer or of a private network, and a private network's address is never handed to a proxy by its name (that network's own machines are there)`, [], [], []], `https, ${said} address, a proxy of this computer: refused, nothing asked of it`);
  }
  // A certificate for another name (the site's is api.example.com's), and one of no CA trusted (a hop that
  // trusts the public CAs alone, not the test's): TLS fails, the request never sent, and the block told one
  // why for all (what failed is the log's alone: told, it would say what answers at a private address);
  // NODE_TLS_REJECT_UNAUTHORIZED=0 (Node's default turned off: a shell set so for a company's TLS
  // inspection) changes none of it.
  names["loop.cdn.example.com"] = LOOP;
  const publicOnly = createNetRoute({ root, catalog, now: () => clock, hop: pinnedHop({ resolve, proxyFor: async () => proxyNow, connect }), log: (line) => logged.push(line) });
  const resolvedTo = (host) => `${host} resolved to 127.129.1.73, an address of this computer or of a private network`;
  const unproved = (host) => `${resolvedTo(host)}, and no site the proxy of this computer reached by its name proved to be it`;
  const unauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  for (const off of [false, true]) {
    if (off) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const when = off ? ", NODE_TLS_REJECT_UNAUTHORIZED=0" : "";
    fresh();
    reset();
    const otherName = await ask(`https://loop.cdn.example.com/v1/rate?wrong=name&off=${off}`);
    await settle();
    assert.deepEqual([otherName.code, otherName.why, proxied.map(({ target }) => target), secureNames, seen], ["offline", unproved("loop.cdn.example.com"), ["loop.cdn.example.com:443"], ["loop.cdn.example.com"], []], `a certificate for another name${when}: the handshake fails, nothing of the request sent`);
    assert.equal(logged.at(-1), `test/rates: loop.cdn.example.com refused (offline: ${resolvedTo("loop.cdn.example.com")}, handed by its name to the proxy (127.0.0.1:${proxyPort}): ERR_TLS_CERT_ALTNAME_INVALID)`, `what failed${when}: the log's line`);
    reset();
    const untrusted = await publicOnly.answer({ block: "test/rates", url: `https://api.example.com/v1/rate?wrong=ca&off=${off}` });
    await settle();
    assert.deepEqual([untrusted.code, untrusted.why, proxied.map(({ target }) => target), seen], ["offline", unproved("api.example.com"), ["api.example.com:443"], []], `a certificate of no public CA${when}: the handshake fails, nothing of the request sent`);
    assert.match(logged.at(-1), /: DEPTH_ZERO_SELF_SIGNED_CERT\)$/, `no public CA${when}: the log names it`);
  }
  if (unauthorized === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  else process.env.NODE_TLS_REJECT_UNAUTHORIZED = unauthorized;
  // A proxy that hangs up on a CONNECT it could not take on (as one may where the name's machine does not
  // answer): running, so the block is told what any failure by a name tells it, not "not running".
  const hangUp = net.createServer((socket) => socket.destroy());
  proxyNow = `http://127.0.0.1:${await listen(hangUp)}`;
  reset();
  const hungUp = await ask("https://loop.cdn.example.com/v1/rate?hung=up");
  assert.deepEqual([hungUp.code, hungUp.why, seen], ["offline", unproved("loop.cdn.example.com"), []], "a proxy that hangs up: offline, one why for all");
  assert.match(logged.at(-1), /handed by its name to the proxy \(127\.0\.0\.1:\d+\): (ECONNRESET|socket hang up)\)$/, "what it did, the log's");
  await close(hangUp);
  proxyNow = local;
  // A redirect from it: to an http address of a name answered so, to an IP of a private network.
  routes.set("/hop/plain", (request, response) => { response.writeHead(302, { location: "http://api.example.com/v1/rate" }); response.end(); });
  routes.set("/hop/literal", (request, response) => { response.writeHead(302, { location: "https://10.0.0.9/admin" }); response.end(); });
  reset();
  const toPlain = await ask("https://api.example.com/hop/plain");
  assert.deepEqual([toPlain.code, toPlain.why, seen.map(({ path: at }) => at)], ["private", `${resolvedHere}, and an http address is never handed to a proxy by its name (no TLS to check the site)`, ["/hop/plain"]], "a redirect to http: refused at that hop");
  reset();
  const toLiteral = await ask("https://api.example.com/hop/literal");
  assert.deepEqual([toLiteral.code, toLiteral.address, toLiteral.why, proxied.map(({ target }) => target)], ["private", "10.0.0.9", "10.0.0.9 is an address of this computer or of a private network", ["api.example.com:443"]], "a redirect to an IP of a private network: refused, never handed on");
  names["api.example.com"] = [PUBLIC];
  proxyNow = null;
}

// An oversized answer: by its length, by what it sends with none said, and by what it unpacks to.
{
  const big = "x".repeat(LIMIT + 10);
  routes.set("/big/length", (request, response) => { response.writeHead(200, { "content-type": "text/plain", "content-length": Buffer.byteLength(big) }); response.end(big); });
  routes.set("/big/chunked", (request, response) => { response.writeHead(200, { "content-type": "text/plain" }); response.write(big.slice(0, 300_000)); response.end(big.slice(300_000)); });
  routes.set("/big/packed", (request, response) => { const packed = zlib.gzipSync(Buffer.alloc(4 * LIMIT, 48)); response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip", "content-length": packed.length }); response.end(packed); });
  routes.set("/small/packed", (request, response) => { const packed = zlib.gzipSync(JSON.stringify({ packed: true })); response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" }); response.end(packed); });
  for (const at of ["/big/length", "/big/chunked", "/big/packed"]) assert.deepEqual([(await ask(`http://api.example.com${at}`, { as: "text" })).code], ["too-large"], `${at}: more than ${LIMIT} bytes`);
  assert.deepEqual((await ask("http://api.example.com/small/packed")).data, { packed: true }, "a small answer packed: unpacked");
}

// No consent: refused with the hosts waiting, before anything is resolved; a block that does not load,
// or whose needs name no host of the net, refused too; and what is no JSON or text, an error status, an
// answer that is no JSON asked for as JSON.
{
  const kept = settings.net["test/rates"];
  delete settings.net["test/rates"];
  reset();
  const answer = await ask("http://api.example.com/v1/rate?no-consent");
  assert.deepEqual([answer.code, answer.hosts], ["consent", NEEDS.map((need) => need.slice(4))], "no consent: refused, the block's hosts all waiting");
  assert.deepEqual([asked, dialed, seen], [[], [], []], "nothing resolved, dialed or asked");
  settings.net["test/rates"] = kept.filter((host) => host !== "api.example.com");
  assert.deepEqual((await ask("http://api.example.com/v1/rate?one")).hosts, ["api.example.com"], "allowed for others: the one waiting");
  settings.net["test/rates"] = kept;
  assert.equal((await route.answer({ block: "test/gone", url: "http://api.example.com/" })).code, "missing");
  assert.equal((await route.answer({ block: "test/plain", url: "http://api.example.com/" })).code, "host");
  assert.equal((await ask("http://api.example.com/", { as: "blob" })).code, "url");
  routes.set("/picture", (request, response) => { response.writeHead(200, { "content-type": "image/png" }); response.end(Buffer.alloc(10)); });
  routes.set("/broken", (request, response) => { response.writeHead(500, { "content-type": "application/json" }); response.end("{}"); });
  routes.set("/words", (request, response) => { response.writeHead(200, { "content-type": "text/plain" }); response.end("rate 7.12"); });
  routes.set("/untyped", (request, response) => { response.removeHeader("content-type"); response.writeHead(200); response.end("[1,2]"); });
  assert.deepEqual([(await ask("http://api.example.com/picture")).code, (await ask("http://api.example.com/broken")).status, (await ask("http://api.example.com/words")).code, (await ask("http://api.example.com/words", { as: "text" })).data, (await ask("http://api.example.com/untyped")).data],
    ["type", 500, "type", "rate 7.12", [1, 2]], "a picture refused, a 500 said, words not JSON as JSON but as text, no type read as text");
}

// Offline: a name that does not resolve, a site that does not answer; the answer kept given whatever its age.
{
  reset();
  assert.equal((await ask("http://nowhere.cdn.example.com/x")).code, "offline", "a name that does not resolve");
  names["down.cdn.example.com"] = [PUBLIC];
  const offline = createNetRoute({ root, catalog, now: () => clock, hop: pinnedHop({ resolve, proxyFor: async () => null, connect: () => net.connect(freePort, "127.0.0.1") }) });
  assert.equal((await offline.answer({ block: "test/rates", url: "http://down.cdn.example.com/x" })).code, "offline", "a site that does not answer");
  fresh();
  const kept = await offline.answer({ block: "test/rates", url: "http://api.example.com/v1/rate?base=USD" });
  assert.deepEqual([kept.ok, kept.cached, kept.data], [true, true, { rate: 7.12 }], "what was kept of it, from the disk, given as it is");
}

// The rate: RATE fetches of a block a minute, then what is kept or a refusal.
{
  routes.set("/count", json({ n: 1 }));
  let refusedAt = null;
  for (let index = 0; index <= RATE + 1 && refusedAt === null; index++) if ((await ask(`http://api.example.com/count?${index}`)).code === "rate") refusedAt = index;
  assert.ok(refusedAt !== null && refusedAt <= RATE, `refused once the block made ${RATE} fetches in a minute (at ${refusedAt})`);
  clock += 60_001;
  assert.equal((await ask("http://api.example.com/count?later")).ok, true, "a minute later: fetched");
}

// A key: written in by the server where the address names it, never in what is kept or embedded.
{
  routes.set("/keyed", (request, response) => json({ key: new URL(request.url, "http://x").searchParams.get("apikey") })(request, response));
  assert.deepEqual([(await ask("http://api.example.com/keyed?apikey={key}")).code, (await ask("http://api.example.com/keyed?apikey={key}")).host], ["key", "api.example.com"], "no key for its host: refused, the host said");
  await writeKey(root, "api.example.com", "s3cret key");
  reset();
  const answer = await ask("http://api.example.com/keyed?apikey={key}", { doc: "report" });
  assert.deepEqual([answer.data, seen[0].path], [{ key: "s3cret key" }, "/keyed?apikey=s3cret%20key"], "the site given the workspace's key");
  await route.cache.settled();
  const files = fs.readdirSync(path.join(root, ".gallery", "cache", "net"), { recursive: true }).filter((name) => name.endsWith(".json"));
  assert.ok(files.every((name) => !fs.readFileSync(path.join(root, ".gallery", "cache", "net", name), "utf8").includes("s3cret%20key")), "the cache knows the address by {key}, never the key");
  // What the site says back may hold the key it was sent: a redirect that sends the query on (to another
  // port: refused, url), a type that names it (refused, type). Neither the refusal the page is given nor
  // the log's line holds it.
  routes.set("/keyed/moved", (request, response) => { response.writeHead(302, { location: `http://api.example.com:8443/keyed${new URL(request.url, "http://x").search}` }); response.end(); });
  routes.set("/keyed/typed", (request, response) => { response.writeHead(200, { "content-type": `image/${new URL(request.url, "http://x").searchParams.get("apikey")}` }); response.end("x"); });
  logged.length = 0;
  reset();
  const moved = await ask("http://api.example.com/keyed/moved?apikey={key}");
  assert.deepEqual([moved.code, seen[0].path], ["url", "/keyed/moved?apikey=s3cret%20key"], "the site was sent the key and sent it on in its Location");
  assert.equal(moved.why, "a redirect to http://api.example.com:8443: an address at another port than its scheme's: a needs' host names none", "the redirect said by its scheme and host alone");
  await writeKey(root, "api.example.com", "s3cret-key");
  const typed = await ask("http://api.example.com/keyed/typed?apikey={key}");
  assert.deepEqual([typed.code, typed.type], ["type", "image/{key}"], "a type that names the key: {key} said in its place");
  assert.equal(logged.length, 2, "both refusals logged");
  assert.ok(![JSON.stringify(moved), JSON.stringify(typed), ...logged].some((text) => /s3cret/.test(text)), "the key in no refusal and no line of the log");
}

// The request: Origin and a JSON body (no token: a page no editor runs on fetches too); a POST alone.
{
  const server = http.createServer((request, response) => route.handle(request, response));
  const port = await listen(server);
  const post = (headers, body = JSON.stringify({ block: "test/rates", url: "http://api.example.com/v1/rate?base=USD" })) => fetch(`http://127.0.0.1:${port}/__gallery/net`, { method: "POST", headers, body }).then(async (answer) => [answer.status, await answer.json()]);
  const origin = `http://127.0.0.1:${port}`;
  assert.deepEqual((await post({ "content-type": "application/json", origin }))[0], 200, "from a page of this server: answered");
  assert.equal((await post({ "content-type": "application/json", origin: "https://elsewhere.example" }))[0], 403, "another site's page: refused");
  assert.equal((await post({ "content-type": "application/json" }))[0], 403, "no Origin: refused");
  assert.equal((await post({ "content-type": "text/plain", origin }))[0], 415, "no JSON: refused (a form another site's page could post)");
  assert.equal((await post({ "content-type": "application/json", origin }, "x".repeat(20_000)))[0], 413, "a body too large");
  assert.equal((await fetch(`http://127.0.0.1:${port}/__gallery/net`)).status, 405, "a GET");
  await close(server);
}

// The export's snapshot: the answers a document's instances asked for last, as they asked for them.
{
  await route.cache.settled();
  const snapshot = netSnapshot(root, "report");
  assert.deepEqual(Object.keys(snapshot), ["http://api.example.com/keyed?apikey={key}", "http://api.example.com/v1/rate?base=USD"], "the document's addresses, the last asked for first, {key} as written");
  assert.deepEqual(snapshot["http://api.example.com/v1/rate?base=USD"].data, { rate: 7.12 });
  assert.equal(netSnapshot(root, "other-document"), null, "none for a document that asked for nothing");
  assert.deepEqual(Object.keys(netSnapshot(root, "report", (url) => !url.includes("keyed"))), ["http://api.example.com/v1/rate?base=USD"], "only what `allowed` lets through");
}

await Promise.all([site, secureSite, proxy].map(close));
fs.rmSync(root, { recursive: true, force: true });
console.log("Checked the net route: the policy's addresses, hosts and keys; the static scan letting context.fetch through; and against servers of this computer a private address, a redirect, DNS rebinding, a proxy (http, https by CONNECT, fake-ip, not running), an oversized answer, no consent, offline, the cache, the rate, the key, the request's checks and the export's snapshot.");
