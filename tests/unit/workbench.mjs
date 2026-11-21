import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { projectRoot } from "../../src/shared/paths.mjs";

// The workbench app (src/workbench/app/, React and TypeScript) type-checks: strict, no unused names,
// its session types against the shared protocol module. What it does is tested in a real browser
// (tests/browser/, the workbench scenarios).

const tsc = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
const result = spawnSync(process.execPath, [tsc, "-p", path.join(projectRoot, "src", "workbench", "app")], { encoding: "utf8" });
assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

console.log("Checked the workbench app: TypeScript strict, against the shared session protocol.");
