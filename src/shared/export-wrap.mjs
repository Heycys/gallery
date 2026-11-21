// What an export of a report wraps its parts in, written once for the two things that make an
// export: the CLI's (src/render/pipeline.mjs) and the reader's 导出当前视图副本 (src/render/kit/ui.js,
// which the kit's build bundles with this file), so that one export cannot allow what the other forbids;
// only gallery export --allow-images, asked for by name, widens the CLI's (exportPolicy, below).

// An export's policy, its pictures' sources given (`images`: those exportPolicy takes, none by default).
const policyOf = (images) => [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  ["img-src data: blob:", ...images].join(" "),
  "font-src data:",
  "media-src data: blob:",
  "frame-src https: data: blob:", // an embed block's page (online), or its file
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** The policy of an export: nothing reaches the network but an embed block's page (online). */
export const EXPORT_CSP = policyOf([]);

// What else an export may load its pictures from (gallery export --allow-images, src/cli/export.mjs): for
// a program that publishes the export on a platform (语雀) and puts its pictures there, writing their web
// addresses in the file in place of the data: URLs, which the policy above would block (the pictures
// shown blank). The option is that program's interface, never the policy's text: a program that rewrote
// the meta would miss it the day its words changed, and nothing would say so. https sources alone, each
// `https:` (any https address) or an origin, https://host or https://host:port, its host's first label
// "*" for any (https://*.example.com); a trailing "/" is dropped, letters made lowercase. Read strictly,
// so that nothing given there adds a directive or another kind of source: a source with anything else
// in it (a space, a line break, ";", ",", a quote, a letter outside ASCII, a path, another scheme, a
// keyword such as 'unsafe-inline') is refused with why. Never the reader's in-page 导出当前视图副本 (ui.js),
// whose copy keeps EXPORT_CSP.
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HTTPS_ORIGIN = new RegExp(`^https://((?:\\*\\.)?${LABEL}(?:\\.${LABEL})*)(?::([0-9]{1,5}))?/?$`);
/** At most this many sources an export may load its pictures from. */
export const IMAGE_SOURCES_MAX = 20;
const TAKES = "it takes https: (any https address) or an origin, https://cdn.example.com or https://*.example.com (a port may follow; no path)";

// One source as the policy writes it, or an Error saying why it is none.
function imageSource(given) {
  if (typeof given !== "string" || given === "") throw new Error(`an empty source: ${TAKES}, sources separated by commas`);
  const said = JSON.stringify(given);
  if (/[\s\u0000-\u001f\u007f]/.test(given)) throw new Error(`${said} holds a space or a line break: one source each, separated by commas`);
  if (/[^!-~]/.test(given)) throw new Error(`${said} holds a letter outside ASCII: write the host's xn-- form (its punycode)`);
  if (/[;'"`\\<>]/.test(given)) throw new Error(`${said} holds ; or a quote, which the policy reads as another directive or another kind of source: ${TAKES}`);
  const value = given.toLowerCase();
  if (value === "https:") return value;
  const origin = HTTPS_ORIGIN.exec(value);
  const [, host, port] = origin ?? [];
  if (origin && host.length <= 253 && (port === undefined || (Number(port) >= 1 && Number(port) <= 65535))) return `https://${host}${port === undefined ? "" : `:${port}`}`;
  if (/^(?:data|blob):/.test(value)) throw new Error(`${said}: an export shows data: and blob: pictures already; ${TAKES}`);
  if (/^[a-z][a-z0-9+.-]*:/.test(value) && !value.startsWith("https:")) throw new Error(`${said}: only https sources: ${TAKES}`);
  if (value === "*" || value.startsWith("https://*") && !value.startsWith("https://*.")) throw new Error(`${said} is any address of any kind: for every https one, write https:`);
  if (/^https:\/\/[^/?#]+[/?#]./.test(value)) throw new Error(`${said} has a path: ${TAKES}`);
  throw new Error(`${said} is no https source: ${TAKES}`);
}

/**
 * The sources an export may load its pictures from, each of `values` one or more separated by commas
 * (as gallery export --allow-images takes them), as its policy writes them, each once, in the order
 * given: or an Error saying the first that is none (imageSource) and why.
 */
export function imageSources(values = []) {
  const sources = [];
  for (const value of [values].flat()) {
    if (typeof value !== "string") throw new Error(`an empty source: ${TAKES}`);
    for (const given of value.split(",")) {
      const source = imageSource(given);
      if (!sources.includes(source)) sources.push(source);
    }
  }
  if (sources.length > IMAGE_SOURCES_MAX) throw new Error(`${sources.length} sources: ${IMAGE_SOURCES_MAX} at most (https: takes every https address)`);
  return sources;
}

/**
 * The policy of an export that may also load its pictures from `images` (imageSources reads them, and
 * throws for one that is none, so that no caller puts anything else in): EXPORT_CSP when there are none.
 */
export const exportPolicy = ({ images = [] } = {}) => policyOf(imageSources(images));

// Some desktop HTML viewers expose CommonJS globals inside local documents. UMD bundles such as D3
// otherwise write into `exports` and leave `globalThis.d3` undefined, so report shells render but
// their charts stay empty. Shadow those globals only while the bundle initializes and force its
// normal browser-global branch.
/** A UMD bundle's source, run with the CommonJS globals shadowed. */
export const isolateUmd = (source) => `(function (exports, module, define) {\n${source}\n}).call(globalThis, undefined, undefined, undefined);`;

/** A component package's stylesheet as the text of a <style>: nothing in it ends the element. A style reads the escape as the slash it stands for. */
export const styleText = (css) => css.replace(/<\/style/gi, "<\\/style");

/**
 * A component package's kit.js as a page runs it, the route's copy and an export's alike: in a function
 * of its own, so that what it declares is its own and two packages on a page never meet. A classic
 * script all the same, `this` the global object, its lines the file's lines.
 */
export const packageScript = (code) => `(function () {${code}\n}).call(globalThis);`;

/**
 * A component package's script as the text of a <script>, whatever it holds. An author's text may say
 * </script>, which would end the element, and <!-- and <script, after which the parser takes the next
 * end tag for a part of it, and no rewriting of a script's text keeps its sense in a string, a regular
 * expression, a comment and code alike. So its text stays a string, where < can be escaped, and goes
 * in as a script of its own, run where it stands; the policy allows that as any inline script.
 */
export const scriptText = (code) => `(function () {
  var script = document.createElement("script");
  script.textContent = ${JSON.stringify(code).replace(/</g, "\\u003c")};
  document.currentScript.after(script);
  script.remove();
})();`;

// Which report.html an export was made from: the sha256 of the file's bytes as the export read them,
// in a meta of its own right after the export's policy (pipeline.mjs withExportPolicy), which
// gallery qa compares with the file as it is now (src/cli/qa.mjs, so that a file restored or
// copied is judged by its text, never by when it was written) and an import of the export takes out
// again (src/transfer/own-report.mjs). Never in report.html itself. Named as the view copy's
// doc-export-id is (ui.js).
export const SOURCE_META = "doc-export-source";

// Which component packages an export holds, each by its stamp, in a meta of its own right after that
// one, none for a page of no package: an export is as old as what it holds of them, which a
// document's text does not say, and gallery qa compares these with what the workspace holds now.
export const PACKAGES_META = "doc-export-packages";
/** How `packages` (their ids and stamps, any order) are said, in that meta and by gallery qa: "" for none. */
export const packagesSaid = (packages) => packages.map(({ id, stamp }) => `${id}@${stamp}`).sort().join(" ");
/** The meta saying an export holds `packages`. */
export const packagesMeta = (packages) => `<meta name="${PACKAGES_META}" content="${packagesSaid(packages)}">`;

// Who made an export: <meta name="generator" content="Gallery">, the first of its head (pipeline.mjs
// withExportPolicy). An export made before the product's rename (2026-10-26) says "HTML Report Studio":
// every reader takes either (exportSourceOf below, an import's undoExport in src/transfer/own-report.mjs,
// the kit's runtime/kernel.js, which writes the two out as a classic script), and no export is rewritten.
export const GENERATOR = "Gallery";
/** The generators an export may name: the new one first, then the one exports made before said. */
export const GENERATORS = [GENERATOR, "HTML Report Studio"];

/** The meta saying an export was made from a report.html whose bytes' sha256 is `hash`. */
export const sourceMeta = (hash) => `<meta name="${SOURCE_META}" content="sha256:${hash}">`;

// An export's own metas, where it writes them, right after its generator and its policy at the start of its head.
const OWN_METAS = new RegExp(`<head\\b[^>]*>\\s*<meta name="generator" content="(?:${GENERATORS.join("|")})">\\s*<meta http-equiv="Content-Security-Policy" content="[^"]*">\\s*<meta name="${SOURCE_META}" content="sha256:([0-9a-f]{64})">(?:\\s*<meta name="${PACKAGES_META}" content="([^"]*)">)?`, "i");

/** The sha256 an export (`html`, its text) says it was made from: its sourceMeta; null when it says none. */
export function exportSourceOf(html) {
  const found = OWN_METAS.exec(html);
  return found ? found[1].toLowerCase() : null;
}

/** The packages an export (`html`, its text) says it holds, as packagesSaid says them; "" when it says none. */
export const exportPackagesOf = (html) => OWN_METAS.exec(html)?.[2] ?? "";

// What an export carries besides the page, each a <script> of data on a line of its own before </body>
// (src/transfer/carry.mjs writes both; neither runs):
//   COPY_DATA, the document's words as gallery read writes them, { text, markdown } in JSON (its "<" escaped):
//   what the display menu's 复制为完整文本 and 复制为 Markdown put on the clipboard (ui.js)
//   CARRIED, the document as its author wrote it, for an import of the file to give it back as it was
//   (src/transfer/carry.mjs carriedOf, import.mjs carriedPage): JSON, deflated (raw) and in base64, of { v: CARRIED_VERSION,
//   file (the sha256 of the export's text without this line: an export changed after it was made carries a
//   source that is no longer the page), source (its doc.html's text, as the export read it), doc (its
//   doc.json's title, icon, description and type, and the look it shows), files (each file of its assets/ the
//   page names: [{ name, sha256, copy?: { sha256, type }, data? }], a picture the export made lighter with its
//   copy's, an embed's file that embeds written as links left out with its bytes in base64) }; the attribute's
//   value the HMAC-SHA256 of that text by the export key of the computer that made it (carry.mjs exportKey),
//   which alone makes the file one an import there trusts with its scripts.
export const COPY_DATA = "data-doc-copy";
export const CARRIED = "data-doc-source";
export const CARRIED_TYPE = "application/x-gallery-source";
export const CARRIED_VERSION = 1;
