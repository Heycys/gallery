// All projects share one origin. Only document resources and operations carry an owner;
// package assets and the workbench itself stay at the root of that origin.
export const projectBase = (id) => `/~${id}`;
export function projectItem(value) {
  const match = /^~(ws-[0-9a-f]{6})\/([^/]+)$/.exec(String(value ?? ""));
  return match ? { ws: match[1], slug: match[2], base: projectBase(match[1]) } : null;
}
const PROJECT = /^(\/~(ws-[0-9a-f]{6}))(?=\/|$)/;
export const projectOfPath = (pathname) => PROJECT.exec(pathname)?.[2] ?? null;
export const localPath = (pathname) => pathname.replace(PROJECT, "") || "/";
export const currentProjectBase = () => PROJECT.exec(globalThis.location?.pathname ?? "")?.[1] ?? "";
export function workspaceAddress(address, base = currentProjectBase()) {
  if (!base || typeof address !== "string" || projectOfPath(address)) return address;
  // Editor modules, emoji data and the global custom-block catalog are shared by every
  // document. Keep their canonical URLs to reuse the cache without project redirects.
  if (/^\/__gallery\/(?:edit\/(?:v\/[a-f0-9]{16}\/)?src\/|components\/)/.test(address)) return address;
  return /^\/(?:__gallery\/|generated\/|pages\/)/.test(address) ? base + address : address;
}

/** Browser state is shared by origin, so a document's owner is part of its identity. */
export const documentKey = (slug, base = currentProjectBase()) => base && typeof slug === "string" && slug && !slug.startsWith("~") ? base.slice(1) + "/" + slug : slug;
export const workspaceStoragePrefix = (base = currentProjectBase()) => base ? "gallery-project:" + base.slice(1) + ":" : "";
