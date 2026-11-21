import { refusal, said } from "../shared/i18n/index.mjs";
import { SITE_ICON_BYTES, SITE_ICON_TYPES, loginTitle } from "../shared/web-links.mjs";
import { fetchWeb, readLimited, readWhole } from "./net-fetch.mjs";
// What a web page says of itself, for a bookmark (components/bookmark/): its title (og:title, twitter:title or
// <title>), its description (og:description, twitter:description or description), its icon (the
// page's link rel=icon, else /favicon.ico) and its cover (og:image, twitter:image). The page is read
// once (10 s, 1.5 MB at most); the icon and the cover are downloaded by `keep` (8 s, 5 MB at most,
// images only) into the report's folder, so an export holds them; one that cannot be had is left out.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

const decodeEntities = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, entity) => {
  if (entity[0] === "#") {
    const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }
  return ENTITIES[entity.toLowerCase()] ?? whole;
});
const clean = (text) => decodeEntities(String(text ?? "")).replace(/\s+/g, " ").trim();

function attributesOf(tag) {
  const out = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? "";
  return out;
}

function decodeHtml(bytes, contentType) {
  let charset = /charset=([\w-]+)/i.exec(contentType ?? "")?.[1];
  if (!charset) charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(bytes.subarray(0, 4096).toString("latin1"))?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** A page's title, description, icon and cover (absolute addresses), from its head. */
export function parseMeta(html, base) {
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > 0 ? html.slice(0, headEnd) : html.slice(0, 300000);
  const meta = {};
  const icons = [];
  for (const [tag] of head.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const attributes = attributesOf(tag);
    if (/^<meta/i.test(tag)) {
      const key = (attributes.property || attributes.name || attributes.itemprop || "").toLowerCase();
      if (key && attributes.content !== undefined && !(key in meta)) meta[key] = attributes.content;
    } else if (attributes.rel && attributes.href && /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(attributes.rel)) {
      icons.push({ rel: attributes.rel.toLowerCase(), href: attributes.href });
    }
  }
  const absolute = (value) => {
    try {
      return value ? new URL(decodeEntities(value), base).href : null;
    } catch {
      return null;
    }
  };
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const icon = icons.find((each) => /(^|\s)icon(\s|$)/.test(each.rel)) ?? icons.find((each) => each.rel.includes("icon"));
  return {
    title: clean(meta["og:title"] || meta["twitter:title"] || titleTag || "").slice(0, 300),
    description: clean(meta["og:description"] || meta["twitter:description"] || meta.description || "").slice(0, 600),
    icon: absolute(icon?.href) || absolute("/favicon.ico"),
    cover: absolute(meta["og:image"] || meta["og:image:url"] || meta["og:image:secure_url"] || meta["twitter:image"] || meta["twitter:image:src"]),
  };
}

// An image from the web, or one a page wrote into its link as a data: address (8 s, 5 MB at most), or null.
async function fetchImage(url) {
  if (!url) return null;
  try {
    const response = await fetchWeb(url, { timeout: 8000, accept: "image/*,*/*;q=0.5", protocols: ["http:", "https:", "data:"] });
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!response.ok || !/^image\//.test(type)) return null;
    const bytes = await readWhole(response, 5 * 1024 * 1024);
    return bytes?.length ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Anonymous preflight, not proof of the authenticated browser's policy: { frameable, reason? }.
 * Definite framing denials become a card/bookmark. Login/error responses and explicit ancestor
 * allowlists are left for the browser, which has the cookies and actual ancestor context.
 */
export async function frameable(target) {
  try {
    const response = await fetchWeb(target, { timeout: 8000, accept: "text/html,*/*;q=0.8" });
    response.body?.cancel().catch(() => {});
    // Anonymous login/error responses say nothing about the browser's authenticated document.
    if ([401, 403].includes(response.status) || loginAddress(response.url)) return { frameable: true, reason: "auth" };
    if (!response.ok) return { frameable: true, reason: "unknown" };
    const options = (response.headers.get("x-frame-options") ?? "").toLowerCase();
    // Multiple CSP headers are joined with commas (Yuque uses a separate frame policy).
    // Each policy applies; a permissive one cannot undo another policy's restriction.
    const ancestors = (response.headers.get("content-security-policy") ?? "").split(",")
      .map(policy => /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(policy)?.[1]?.trim().toLowerCase())
      .filter(value => value !== undefined);
    // An enforced frame-ancestors directive takes precedence over X-Frame-Options. Explicit
    // origin allowlists require the browser's full ancestor context: do not guess a rejection.
    if (ancestors.length) {
      if (ancestors.some(value => value === "'none'" || value === "'self'")) return { frameable: false, reason: "frame-ancestors" };
      return { frameable: true, ...(ancestors.every(value => value === "*") ? {} : { reason: "unknown" }) };
    }
    if (options.split(",").some(value => /^(deny|sameorigin)$/.test(value.trim()))) return { frameable: false, reason: "x-frame-options" };
    return { frameable: true };
  } catch (error) {
    return error.reason === "url" ? { frameable: false, reason: "url" } : { frameable: true, reason: "unknown" };
  }
}

function loginAddress(address) {
  try {
    const url = new URL(address);
    return /^(?:login|signin|passport|sso)\./i.test(url.hostname) || /\/(?:login|signin|sign-in|oauth2\/challenge)(?:[/.]|$)/i.test(url.pathname);
  } catch { return false; }
}

/** A title suggestion, never a login page's title. Browser cookies stay in the browser. */
export async function pageTitle(target) {
  try {
    const response = await fetchWeb(target, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" } });
    if ([401, 403].includes(response.status) || loginAddress(response.url)) {
      response.body?.cancel().catch(() => {});
      return { title: "", reason: "auth" };
    }
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !/html|xml/i.test(type)) {
      response.body?.cancel().catch(() => {});
      return { title: "", reason: "unknown" };
    }
    const title = parseMeta(decodeHtml(await readLimited(response, 1.5 * 1024 * 1024), type), response.url || target).title;
    return loginTitle(title) ? { title: "", reason: "auth" } : { title: title.slice(0, 200) };
  } catch { return { title: "", reason: "unknown" }; }
}

// What an icon's first bytes say it is, for a server that names none of SITE_ICON_TYPES (application/octet-stream).
function sniffIcon(bytes) {
  const head = bytes.subarray(0, 16);
  if (head[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return "image/x-icon";
  if (head.toString("latin1", 0, 3) === "GIF") return "image/gif";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.subarray(0, 512).toString("utf8"))) return "image/svg+xml";
  return null;
}

// An icon at `url` as a data: address (one of SITE_ICON_TYPES, SITE_ICON_BYTES at most), or null.
async function iconData(url, timeout) {
  if (!url || timeout <= 0) return null;
  try {
    const response = await fetchWeb(url, { timeout, accept: "image/*,*/*;q=0.5", protocols: ["http:", "https:", "data:"] });
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      return null;
    }
    const said = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const bytes = await readWhole(response, SITE_ICON_BYTES);
    if (!bytes?.length) return null;
    const type = SITE_ICON_TYPES.includes(said) ? said : sniffIcon(bytes);
    return type ? `data:${type};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null;
  }
}

/**
 * A site's own icon for a web link of the sidebar (shared/web-links.mjs siteIcon), fetched once as the link is
 * added: the page's <link rel~=icon> (its head read, 512 KB at most), else /favicon.ico of where it ended up,
 * through the fetch a bookmark's title is read with (fetchWeb: http or https, the system's proxy, this
 * computer and the local network direct); PNG, ICO, SVG, JPEG, WebP or GIF, 16 KB at most, as a data: address.
 * `timeout` ms in all; null when none is had in it (never a failure of the add). GALLERY_SITE_ICON=off fetches
 * none, =local those of this computer alone (the tests set it: a test's link to example.com asks no real site).
 */
export async function siteIcon(target, { timeout = 4000, env = process.env } = {}) {
  if (env.GALLERY_SITE_ICON === "off") return null;
  if (env.GALLERY_SITE_ICON === "local") {
    let host = "";
    try {
      host = new URL(target).hostname.replace(/^\[|\]$/g, "");
    } catch {}
    if (!/^(127\.\d+\.\d+\.\d+|localhost|::1)$/i.test(host)) return null;
  }
  const until = Date.now() + timeout;
  const left = () => until - Date.now();
  let base = target;
  let found = null;
  try {
    const response = await fetchWeb(target, { timeout: left(), accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" });
    base = response.url || target;
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && /html|xml/i.test(type)) found = parseMeta(decodeHtml(await readLimited(response, 512 * 1024), type), base).icon;
    else response.body?.cancel().catch(() => {});
  } catch {
    return null;
  }
  let fallback = null;
  try {
    fallback = new URL("/favicon.ico", base).href;
  } catch {}
  const icon = await iconData(found, left());
  return icon ?? (found !== fallback ? iconData(fallback, left()) : null);
}

/**
 * A web page's bookmark: { url (where it ended up), title, description, icon, cover }; the icon and
 * the cover what `keep(bytes, stem)` made of their images (a file of the report's folder), or null.
 * `icon`, `cover`: false leaves that image out (not downloaded).
 */
export async function unfurl(target, keep, { icon: wantIcon = true, cover: wantCover = true } = {}) {
  const response = await fetchWeb(target, { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", headers: { "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" } });
  const final = response.url || new URL(target).href;
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok) throw refusal(said("网页返回 {0}", response.status), { reason: "download" });
  if (!/html|xml/i.test(type)) {
    response.body?.cancel().catch(() => {});
    return { url: final, title: "", description: "", icon: null, cover: null };
  }
  const info = parseMeta(decodeHtml(await readLimited(response, 1.5 * 1024 * 1024), type), final);
  const save = async (address, stem) => {
    const bytes = await fetchImage(address);
    try {
      return bytes ? await keep(bytes, stem) : null;
    } catch {
      return null; // no image the report keeps (an .ico, say)
    }
  };
  const [icon, cover] = await Promise.all([wantIcon ? save(info.icon, "bookmark-icon") : null, wantCover ? save(info.cover, "bookmark-cover") : null]);
  return { url: final, title: info.title, description: info.description, icon, cover };
}
