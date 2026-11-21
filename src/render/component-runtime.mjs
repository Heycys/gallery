import path from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";
import { projectRoot } from "../shared/paths.mjs";

// What the kit's runtime reads of the components' descriptions (runtimeDescriptions(), and the
// flows, FLOWS and FLOW_BLOCKS: src/shared/components/), as the files hold it now. The server and
// the build import the descriptions once; a description edited under the live preview is read from
// disk here, so a kit rebuild (kit-build.mjs, `fresh`) carries the edit without a restart. The
// descriptions' module is bundled and run in a context of its own, each time.

const index = path.join(projectRoot, "src", "shared", "components", "index.mjs");

/** The runtime's view of the descriptions in `entry` (the components' index module): { descriptions, flows, blockFlows }. */
function view(entry) {
  const { outputFiles } = buildSync({
    stdin: { contents: `import { FLOWS, FLOW_BLOCKS, runtimeDescriptions } from ${JSON.stringify(entry)}; module.exports = { descriptions: runtimeDescriptions(), flows: FLOWS, blockFlows: FLOW_BLOCKS };`, resolveDir: path.dirname(entry), loader: "js" },
    bundle: true, write: false, format: "cjs", platform: "node", logLevel: "silent",
  });
  const sandbox = { module: { exports: null } };
  vm.runInNewContext(outputFiles[0].text, sandbox);
  return JSON.parse(JSON.stringify(sandbox.module.exports));
}

/** What the runtime reads of the descriptions in `entry` (runtimeDescriptions()). */
export const componentRuntime = (entry = index) => view(entry).descriptions;

/** The selectors of the flows the descriptions in `entry` name (FLOWS), which the runtime hands to the kit's other scripts. */
export const componentFlows = (entry = index) => view(entry).flows;

/** The selector of every element blocks stand straight in by the descriptions in `entry` (FLOW_BLOCKS), by which the runtime gives an item its line (runtime/spacing.js). */
export const componentBlockFlows = (entry = index) => view(entry).blockFlows;
