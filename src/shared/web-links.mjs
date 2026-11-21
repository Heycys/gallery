import { iconKind } from "./emoji/icon-value.mjs";

// A web link of the sidebar (docs/workbench.md "Web links"): a folder at the workspace's root, named by
// a slug from the pool documents and custom pages share, holding link.json alone:
//   { "url": "https://open-meteo.com/en/docs", "title": "天气接口文档", "icon": "🌤️", "siteIcon": "data:image/png;base64,…" }
// `url` an http or https address of 2048 characters at most, `title` 1 to 200 characters, `icon` an
// emoji or an icon of the 图标 tab, the user's (no picture: a link keeps no files), `siteIcon` the site's
// own icon, fetched once as the link is added (src/editor/unfurl.mjs siteIcon) and kept in the file as a
// data: address (PNG, ICO, SVG, JPEG, WebP or GIF, 16 KB at most: SITE_ICON_BYTES), shown when the
// user chose none (the grid globe when neither is there). The workbench shows it in its
// content area in a sandboxed frame (features/link/LinkView.tsx), never as a document: no session, no
// export, no check, no search of its text. A folder holding doc.html (or report.html) is a document
// whatever else it holds. What is read and checked here is the same on the server, in the gallery
// command and in the workbench; reading and writing the file is ./workspace.mjs's (Node's).

/** A link's file in its folder. */
export const LINK_FILE = "link.json";
export const LINK_LIMITS = { url: 2048, title: 200 };
/** The largest site icon a link keeps, in bytes (its data: address holds them in base64). */
export const SITE_ICON_BYTES = 16 * 1024;
/** The media types of a site icon a link keeps. */
export const SITE_ICON_TYPES = ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml", "image/jpeg", "image/webp", "image/gif"];

/** Whether `value` is a site icon a link keeps: a base64 data: address of one of SITE_ICON_TYPES, SITE_ICON_BYTES at most. */
export function isSiteIcon(value) {
  if (typeof value !== "string") return false;
  const match = /^data:([a-z+./-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || !SITE_ICON_TYPES.includes(match[1])) return false;
  const bytes = (match[2].length * 3) / 4 - (match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0);
  return bytes > 0 && bytes <= SITE_ICON_BYTES;
}

/**
 * The sandbox of a web page's frame, the embed block's: scripts, its own origin (a page of
 * another site, which can then not reach the workbench's), forms, popups that leave the sandbox, a
 * top navigation only by the reader's own click.
 */
export const WEB_SANDBOX = "allow-scripts allow-popups allow-top-navigation-by-user-activation allow-forms allow-same-origin allow-storage-access-by-user-activation allow-popups-to-escape-sandbox";

/** Login/error headings are not document names (also used for browser-provided clipboard titles). */
export function loginTitle(title) {
  return /(?:^|[|·—–-]\s*)(?:钉钉)?统一身份认证\s*$|^(?:(?:登录|登入|sign[ -]?in|log[ -]?in)(?:$|\s*(?:[|·—–-]|to\b))|(?:401|403)(?:\s|$)|unauthorized|access denied|forbidden|无权访问|访问受限)|(?:[|·—–-]\s*)(?:登录|登入|sign[ -]?in|log[ -]?in)\s*$/i.test(title);
}

const tidy = (value) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/**
 * Address `value` as a link takes it: { url } (the URL's own spelling, a scheme written in) or
 * { refused, message } — "url" (no address), "scheme" (not http or https: javascript:, file:, data:…),
 * "long" (over 2048 characters). An address written without a scheme (example.com/a) is taken as https.
 */
export function linkAddress(value) {
  const written = tidy(value);
  if (!written) return { refused: "url", message: "网址不能是空的" };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(written) ? written : `https://${written}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { refused: "url", message: "这不是一个网址" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { refused: "scheme", message: "只能链接 http 或 https 的网址" };
  if (!url.hostname) return { refused: "url", message: "这不是一个网址" };
  if (url.href.length > LINK_LIMITS.url) return { refused: "long", message: "网址太长了（最多 2048 个字符）" };
  return { url: url.href };
}

/** Whether `icon` is one a link takes: an emoji or an icon of the 图标 tab. */
export const linkIcon = (icon) => ["emoji", "glyph"].includes(iconKind(icon));

/**
 * A link's file as it is to be written: { value: { url, title, icon?, siteIcon? } } or { refused, message }
 * (linkAddress's, "title": empty or over 200 characters, "icon": no emoji nor icon of the 图标 tab). A site
 * icon that is none (isSiteIcon) is left out, never refused: the add never fails for it.
 */
export function linkValue({ url, title, icon = null, siteIcon = null }) {
  const address = linkAddress(url);
  if (address.refused) return address;
  const name = tidy(title);
  if (!name || name.length > LINK_LIMITS.title) return { refused: "title", message: "名称不能是空的，也不能超过 200 个字" };
  if (icon !== null && icon !== undefined && icon !== "" && !linkIcon(icon)) return { refused: "icon", message: "图标只能是表情或图标页签里的图标" };
  return { value: { url: address.url, title: name, ...(icon ? { icon } : {}), ...(isSiteIcon(siteIcon) ? { siteIcon } : {}) } };
}

/** What link.json's text says, as a link: { url, title, icon?, siteIcon? }, or null for a file that is no link (one written by hand wrong). */
export function readLinkText(text) {
  let value;
  try {
    value = JSON.parse(String(text).replace(/^﻿/, ""));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const made = linkValue({ url: value.url, title: value.title, icon: linkIcon(value.icon) ? value.icon : null, siteIcon: value.siteIcon });
  return made.value ?? null;
}

/**
 * Whether address `url` is this Gallery's own (`port` its server's): the workbench's host by any of
 * its names (127.0.0.1, localhost, ::1) and port. A link there is refused: framed with the sandbox's
 * allow-same-origin and scripts, the workbench's own page could reach the workbench.
 */
export function ownAddress(url, port) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const given = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return ["127.0.0.1", "localhost", "::1", "0.0.0.0"].includes(host) && String(port) === given;
}

/**
 * A slug made of words: their Latin letters and digits, lowercase, kebab-case, 60 characters at most
 * (cut where a word ends); "" when none of them is a word of three letters (a title in Chinese, or one
 * whose Latin is a version alone: "… v2.2 …"). gallery import's, and a link's.
 */
export const kebab = (text) => {
  const words = String(text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!/[a-z]{3}/.test(words)) return "";
  return words.length <= 60 ? words : words.slice(0, 61).replace(/-[^-]*$/, "") || words.slice(0, 60);
};

/**
 * The stem of a new link's slug (a number added after it when it is taken: the workspace's freeSlug):
 * its title's Latin words, else its site's name (open-meteo of open-meteo.com, www passed over), else "link".
 */
export function linkStem(title, url) {
  const words = kebab(title);
  if (words) return words;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  const site = kebab(host.split(".")[0] ?? "");
  return site || "link";
}
