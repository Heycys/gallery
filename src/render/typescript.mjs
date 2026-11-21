import { createRequire } from "node:module";
import { typescriptFile } from "../shared/paths.mjs";

// TypeScript, loaded only when a command needs it (a report's script type check: ./typecheck.mjs, for
// gallery check and gallery export; a script that names a kit global read without its comments:
// ./assets.mjs; the SDK's options for the component cards: ./sdk-options.mjs), never as the server or
// a command starts (it takes 160 ms to load). The source checkout's is the typescript package; the
// release's its own minified copy with the libraries it reads beside it (vendor/typescript/:
// src/cli/release-build.mjs), required by its absolute path, whatever folder a chunk of dist/ is in.

const requireFrom = createRequire(import.meta.url);
let loaded = null;

/** The TypeScript compiler's API (the typescript module), loaded the first time it is asked for. */
export function typescript() {
  loaded ??= requireFrom(typescriptFile ?? "typescript");
  return loaded;
}

/**
 * TypeScript's API as a module's `ts` (`ts.createSourceFile`…), loaded the first time one of its names
 * is read, not when the module that holds it is imported.
 */
export const ts = new Proxy({}, { get: (_, name) => typescript()[name] });
