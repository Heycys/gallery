// Gallery's versions compared, with nothing imported: the preview server's choice of a server to use
// or replace (./preview-server.mjs) and gallery --version's notes (src/cli/updates.mjs, which loads
// nothing it can do without) read it.

/** -1, 0 or 1 as version `a` is older than, the same as or newer than `b` (numbers by dots: 0.1.0 < 0.1.10 < 0.2.0). */
export function compareVersions(a, b) {
  const parts = (version) => String(version ?? "0").split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index++) if ((x[index] ?? 0) !== (y[index] ?? 0)) return (x[index] ?? 0) < (y[index] ?? 0) ? -1 : 1;
  return 0;
}

/** A released version as npm writes one, numbers alone (0.1.2): what a registry's answer must be to be believed. */
export const RELEASED = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
