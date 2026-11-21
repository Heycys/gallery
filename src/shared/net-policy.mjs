// What a custom block may reach of the web, and how its address is read (docs/render.md, "A block online"):
// pure, no Node, read by the catalog (a manifest's needs), the
// server's net route (src/server/net-route.mjs: which address a block asks for is its to ask, which
// machine a name stands for may be reached) and the export's snapshot (shared/net-cache.mjs).
//
// A block names each host it reaches in its needs, "net:<host>": a lowercase host name, no port and no
// path, "*." before it for any name under it (never the name itself: write both where both are meant).
// What it asks for is an absolute http or https address on that host, at the scheme's own port, with no
// user or password in it; `{key}` in it (its path or its query) is where the server writes the
// workspace's key for that host, which no page ever holds (keyIn, withKey).
//
// A machine is reached only at an address of the public internet: none of this computer (127/8, ::1),
// of a private network (10/8, 172.16/12, 192.168/16, fc00::/7, 100.64/10 a carrier's), of a link
// (169.254/16, fe80::/10), of what is no host (0/8, multicast, the reserved 240/4, the broadcast) or of
// the ranges kept for documents and tests (192.0.2/24, 198.51.100/24, 203.0.113/24, 2001:db8::/32); an
// IPv6 address that holds an IPv4 one (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d, 2002:…) is held to
// that one. 198.18.0.0/15 (benchmarking) is what a proxy's fake-ip DNS answers with (Clash and its
// kind): it is one only where the address is handed to that proxy (FAKE_IP, proxyHere). A name this
// computer's resolver answers with addresses of this computer or unique-local ones alone (a proxy that
// maps names to 127.x or fd00::/8 addresses of its own: mapsHere) is reached by its name through such a
// proxy, for https alone, its TLS the guard (src/server/net-route.mjs); never a name kept for this
// computer (keptHere), nor one answered with a private IPv4 network's address.

/** The word a manifest's needs say a host after. */
export const NET = "net:";
/** A host a manifest's needs may name: a lowercase name, "*." before it for any name under it. */
export const HOST = /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/** The hosts a block's needs name ("net:<host>" each), in its order. */
export const netHostsOf = (needs) => (Array.isArray(needs) ? needs.filter((need) => typeof need === "string" && need.startsWith(NET)).map((need) => need.slice(NET.length)) : []);

/** Whether `host` (an address's, lowercase) is one a needs' host names: itself, or, for "*.<name>", a name under it. */
export function hostMatches(host, pattern) {
  if (pattern.startsWith("*.")) return host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1;
  return host === pattern;
}

/** The first of `hosts` (a block's needs' hosts) that `host` is, or null. */
export const hostIn = (host, hosts) => hosts.find((pattern) => hostMatches(host, pattern)) ?? null;

// `{key}` as written, and as an address's path writes it (%7B key %7D).
const KEY = /\{key\}|%7Bkey%7D/gi;

/** Whether an address names the workspace's key for its host. */
export const keyIn = (address) => new RegExp(KEY.source, "i").test(address);

/** The address with the key written where it names it (`{key}`), encoded as a part of an address. */
export const withKey = (address, key) => address.replace(KEY, () => encodeURIComponent(key));

/**
 * What a block's `raw` address is: { url } (a URL, its href what the cache and a snapshot name it by), or
 * { code: "url", why } when it is no address a block may ask for.
 */
export function addressOf(raw) {
  if (typeof raw !== "string" || raw.length > 4096) return { code: "url", why: "an address is a string of at most 4096 characters" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { code: "url", why: "not an absolute address" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { code: "url", why: "only http and https addresses" };
  if (url.username || url.password) return { code: "url", why: "an address with a user or a password in it" };
  if (url.port !== "") return { code: "url", why: "an address at another port than its scheme's: a needs' host names none" };
  url.hash = "";
  return { url };
}

// ---------- addresses ----------

// An IPv4 address as its four numbers, or null.
function ipv4(text) {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!parts) return null;
  const numbers = parts.slice(1).map(Number);
  return numbers.every((number) => number <= 255) ? numbers : null;
}

// An IPv6 address as its eight groups (numbers), a zone (%…) left out, or null.
function ipv6(text) {
  let rest = text.replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();
  let tail = [];
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(rest);
  if (dotted) {
    const four = ipv4(dotted[2]);
    if (!four) return null;
    tail = [(four[0] << 8) | four[1], (four[2] << 8) | four[3]];
    rest = dotted[1].endsWith("::") ? dotted[1] : dotted[1].slice(0, -1);
  }
  const halves = rest.split("::");
  if (halves.length > 2) return null;
  const groups = (half) => (half === "" ? [] : half.split(":"));
  const [head, after = null] = [groups(halves[0]), halves.length === 2 ? groups(halves[1]) : null];
  if (![...head, ...(after ?? [])].every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  const known = head.length + (after?.length ?? 0) + tail.length;
  if (after === null ? known !== 8 : known > 7) return null;
  const numbers = (list) => list.map((group) => Number.parseInt(group, 16));
  return [...numbers(head), ...Array(8 - known).fill(0), ...numbers(after ?? []), ...tail];
}

const inRange = (numbers, [first, ...rest], bits) => {
  // `numbers` (an IPv4's four) within first.rest…/bits
  const value = (list) => list.reduce((sum, number) => sum * 256 + number, 0);
  const shift = 2 ** (32 - bits);
  return Math.floor(value(numbers) / shift) === Math.floor(value([first, ...rest]) / shift);
};

// The IPv4 ranges no block reaches: this network, the private ones, a carrier's, loopback, link-local,
// the protocols', the documents' and tests', the old 6to4 relay, multicast, the reserved and the broadcast.
const V4_REFUSED = [
  [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8], [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24], [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16],
  [[198, 51, 100, 0], 24], [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4],
];
/** The fake-ip range a proxy's DNS answers with (198.18.0.0/15, benchmarking's). */
export const FAKE_IP = [[198, 18, 0, 0], 15];

const v4Kind = (four) => (inRange(four, ...FAKE_IP) ? "fake-ip" : V4_REFUSED.some(([start, bits]) => inRange(four, start, bits)) ? "private" : "public");
const embedded = (groups, at) => [groups[at] >> 8, groups[at] & 255, groups[at + 1] >> 8, groups[at + 1] & 255];

// What an IPv6 address is: of the public internet (2000::/3 but the documents', benchmarking's and
// ORCHID's), what the IPv4 address it holds is, or none to reach.
function v6Kind(groups) {
  const zeros = (count) => groups.slice(0, count).every((group) => group === 0);
  if (zeros(5) && groups[5] === 0xffff) return v4Kind(embedded(groups, 6)); // ::ffff:a.b.c.d
  if (zeros(6)) return groups[6] === 0 && groups[7] <= 1 ? "private" : v4Kind(embedded(groups, 6)); // ::, ::1, ::a.b.c.d
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) return v4Kind(embedded(groups, 6)); // NAT64
  if (groups[0] === 0x2002) return v4Kind(embedded(groups, 1)); // 6to4
  if ((groups[0] & 0xe000) !== 0x2000) return "private"; // not global unicast: fc00::/7, fe80::/10, ff00::/8, 100::/64…
  if (groups[0] === 0x2001 && (groups[1] === 0x0db8 || groups[1] === 0x0002 || (groups[1] & 0xfff0) === 0x0010)) return "private";
  return "public";
}

/**
 * What `address` (an IP address, as a resolver gives it) is to a block: "public" (it may be reached),
 * "fake-ip" (198.18.0.0/15, a proxy's DNS: FAKE_IP), "private" (this computer, a private network, or no
 * host to reach), or "none" (no IP address).
 */
export function addressKind(address) {
  const four = ipv4(String(address));
  if (four) return v4Kind(four);
  const groups = ipv6(String(address));
  return groups ? v6Kind(groups) : "none";
}

/**
 * Whether `address` (one addressKind calls private) is what a proxy of this computer that maps names
 * answers with: this computer's (127/8, ::1, ::ffff:127.x) or an IPv6 unique-local one (fc00::/7).
 * Never a private IPv4 network's (10/8, 172.16/12, 192.168/16), a carrier's or a link's: a network's own
 * machines are there (a company's names that its DNS answers inside), which no name may reach.
 */
export function mapsHere(address) {
  const four = ipv4(String(address));
  if (four) return four[0] === 127;
  const groups = ipv6(String(address));
  if (!groups) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) return groups[6] >> 8 === 127;
  return groups.every((group, index) => group === (index === 7 ? 1 : 0)) || (groups[0] & 0xfe00) === 0xfc00;
}

/** Whether `host` (an address's) is a name a resolver keeps for this computer: localhost and the names under it (RFC 6761). */
export const keptHere = (host) => /(?:^|\.)localhost\.?$/i.test(String(host));

/**
 * Whether a proxy's address (`proxy`, a URL or null) is a program on this computer: what a fake-ip
 * answer is handed to, and the name of an https address whose answer here is none of the public internet.
 */
export function proxyHere(proxy) {
  if (!proxy) return false;
  try {
    const host = new URL(proxy).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const loopback6 = ipv6(host)?.every((group, index) => group === (index === 7 ? 1 : 0)) ?? false;
    return host === "localhost" || ipv4(host)?.[0] === 127 || loopback6;
  } catch {
    return false;
  }
}
