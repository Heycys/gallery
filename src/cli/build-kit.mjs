// Usage: node src/cli/build-kit.mjs
// A maintainers' script (npm run dev's predev:local, the browser tests): the shared kit built from its
// sources and the vendor files copied, into public/kit/ and public/vendor/, which the dev server
// serves (src/render/pipeline.mjs writeSharedAssets). Reads and writes no document.
import { kitPublicDirectory, vendorDirectory } from "../shared/paths.mjs";
import { scriptArguments, usageFailureText, usageOf } from "./arguments.mjs";

const { positional } = await scriptArguments(import.meta.url);
if (positional.length > 0) {
  console.error(usageFailureText(usageOf(import.meta.url), `Unknown argument: ${positional[0]} (it takes none).`));
  process.exit(2);
}
const { writeSharedAssets } = await import("../render/pipeline.mjs");
await writeSharedAssets({ fresh: true });
console.log(`Built the shared kit into ${kitPublicDirectory} and ${vendorDirectory}`);
