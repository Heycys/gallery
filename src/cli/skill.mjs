import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { release, reportsDirectory, skillDirectory } from "../shared/paths.mjs";
import { copyOldDocuments, ensureWorkspace, layoutOf, oldStateOf } from "../shared/workspace.mjs";
import { commandArguments, UsageError } from "./arguments.mjs";
import { notOurs, unwritable } from "./gallery.mjs";
import { copiedLines } from "./init.mjs";
import { AGENTS, skillNameOf } from "./skill-record.mjs";

// gallery skill install [--agent claude|codex] [--project] [--dir <path>] (./usage.mjs): the Gallery
// skill that matches this gallery command (the release's skill/, which npm run release:build made
// with package-skill.mjs buildSkill; in a source checkout, buildSkill run into a temporary folder)
// written where an Agent reads skills: Claude Code's <home>/skills/gallery (its home CLAUDE_CONFIG_DIR,
// else ~/.claude), Codex's (CODEX_HOME, else ~/.codex), for each agent whose home is there (neither:
// Claude Code's), or --agent's; --project: <cwd>/.claude/skills/gallery or <cwd>/.codex/skills/gallery
// (each agent whose folder is in <cwd>, else Claude Code's); --dir: that folder itself. What a target
// holds decides what is done (kindOf): nothing → the skill copied in; a Gallery skill (SKILL.md named
// gallery, no tools) → replaced, swapped in by renames (nothing when it holds the same files); an
// older Gallery's skill, the whole tools (SKILL.md named gallery or html-report-studio, package.json
// and src/ or reports/) → its documents copied into the workspace (copyOldDocuments, as gallery init
// --from does), its exports into <workspace>/exports/ where the name is free, then the folder moved
// to <workspace>/.gallery/old-skill-<date>/, never deleted; anything else → refused. In an agent's
// skills folder every other such old skill (any folder name) is moved out too, so the Agent sees one
// Gallery skill; --dir looks at its own folder alone (its neighbours are not a skills folder: a
// checkout of Gallery itself could stand there). Everything is looked at before anything is done: a
// refusal changes nothing. Exits 1 on a refusal (a target holding something else, an old skill whose
// server runs, a move that could not be made), 2 for a wrong command line.

/** The agents a skill is written for (./skill-record.mjs, which gallery --version reads too). */
export { AGENTS };

const isFolder = (target) => statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false;

/**
 * Where the skill goes: [{ agent (a key of AGENTS, or null for --dir), target (the skill's folder),
 * skills (the folder of skills it stands in, whose other old skills are moved out; null for --dir) }].
 */
export function targetsOf({ agent = null, project = false, dir = null, cwd = process.cwd(), env = process.env } = {}) {
  if (dir) return [{ agent: null, target: path.resolve(cwd, dir), skills: null }];
  const keys = agent ? [agent] : Object.keys(AGENTS);
  const homeOf = (key) => (project ? path.join(path.resolve(cwd), AGENTS[key].project) : path.resolve(AGENTS[key].home(env)));
  const present = keys.filter((key) => isFolder(homeOf(key)));
  return (agent || present.length ? (agent ? keys : present) : ["claude"]).map((key) => {
    const skills = path.join(homeOf(key), "skills");
    return { agent: key, target: path.join(skills, "gallery"), skills };
  });
}

/** The `name` of a SKILL.md's front matter, or null. */
function skillName(folder) {
  try {
    return skillNameOf(readFileSync(path.join(folder, "SKILL.md"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * What a folder holds, for a skill to be written there: "absent" (nothing, or an empty folder),
 * "thin" (a Gallery skill: SKILL.md named gallery, and no package.json, src/ or reports/), "fat" (an
 * older Gallery's skill, the whole tools: SKILL.md named gallery or html-report-studio, with
 * package.json and src/, or reports/), else "other" (with `why`). A git checkout is "other" whatever
 * it holds: Gallery's own repository is never moved.
 */
export function kindOf(folder) {
  const stat = statSync(folder, { throwIfNoEntry: false });
  if (!stat) return { kind: "absent" };
  if (!stat.isDirectory()) return { kind: "other", why: "it is a file" };
  const names = readdirSync(folder);
  if (names.length === 0) return { kind: "absent" };
  if (names.includes(".git")) return { kind: "other", why: "it is a git checkout" };
  const name = skillName(folder);
  const has = (entry) => names.includes(entry);
  const tools = (has("package.json") && has("src")) || has("reports");
  if (tools && (name === "gallery" || name === "html-report-studio")) return { kind: "fat", name };
  if (name === "gallery" && !has("package.json") && !has("src") && !has("reports")) return { kind: "thin" };
  return { kind: "other", why: name ? `its SKILL.md is the skill "${name}"` : "it holds no Gallery skill" };
}

/** The older skills (kind "fat") in a folder of skills, by their folder: Gallery's, under any folder name. */
function oldSkillsIn(skills) {
  if (!isFolder(skills)) return [];
  return readdirSync(skills, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => path.join(skills, entry.name))
    .filter((folder) => kindOf(folder).kind === "fat");
}

/** An older skill's preview servers still running: [{ pid, port }] from its announcements whose process runs. */
function serversOf(folder) {
  const announced = path.join(oldStateOf(folder), "servers");
  if (!isFolder(announced)) return [];
  return readdirSync(announced).filter((name) => name.endsWith(".json")).flatMap((name) => {
    try {
      const { pid, port } = JSON.parse(readFileSync(path.join(announced, name), "utf8"));
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return [];
      process.kill(pid, 0);
      return [{ pid, port }];
    } catch (error) {
      return error.code === "EPERM" ? [{ pid: Number.NaN, port: null }] : [];
    }
  });
}

/** Every file of a folder (symbolic links as themselves), and their bytes. */
async function sizeOf(folder) {
  let files = 0;
  let bytes = 0;
  const walk = async (directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        files++;
        bytes += (await fs.lstat(full)).size;
      }
    }
  };
  await walk(folder).catch(() => {});
  return { files, bytes };
}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A rename, tried again a few times on Windows, where a file held open by a reader (an Agent, an indexer) refuses it a moment. */
async function rename(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fs.rename(from, to);
    } catch (error) {
      if (process.platform !== "win32" || attempt >= 10 || !["EPERM", "EBUSY", "EACCES"].includes(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

/** The folder an old skill moves to: <workspace>/.gallery/old-skill-<YYYY-MM-DD>, -2, -3… when that is taken. */
function movedFolder(root, now = new Date()) {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const base = path.join(layoutOf(root).gallery, `old-skill-${day}`);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!existsSync(candidate)) return candidate;
  }
}

/**
 * An older skill moved to `destination`: renamed on the same volume; across volumes copied whole,
 * checked (as many files, as many bytes), then removed. Resolves to null, or why it could not be moved.
 */
async function moveFolder(folder, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    await rename(folder, destination);
    return null;
  } catch (error) {
    if (error.code !== "EXDEV") return `${error.code ?? error.message}`;
  }
  const before = await sizeOf(folder);
  await fs.cp(folder, destination, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, errorOnExist: true, force: false });
  const after = await sizeOf(destination);
  if (after.files !== before.files || after.bytes !== before.bytes) return `the copy holds ${after.files} files, ${after.bytes} bytes, of ${before.files}, ${before.bytes}: the old folder was left as it was`;
  await fs.rm(folder, { recursive: true, force: true });
  return null;
}

/** The skill's files under `folder`: [relative path, bytes] sorted, to tell whether two folders hold the same skill. */
async function contentsOf(folder) {
  const files = [];
  const walk = async (directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push([path.relative(folder, full).split(path.sep).join("/"), await fs.readFile(full)]);
    }
  };
  await walk(folder);
  return files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}
const sameFiles = (a, b) => a.length === b.length && a.every(([name, bytes], index) => name === b[index][0] && bytes.equals(b[index][1]));

/**
 * The skill (the folder `source`) written to `target`: copied beside it first under a dot name, then
 * swapped in by renames (the old one, a Gallery skill, removed only once the new one is in; put back
 * when the new one cannot be). Resolves to "new", "updated" or "same".
 */
async function writeSkill(source, target, kind) {
  if (kind === "thin" && sameFiles(await contentsOf(source), await contentsOf(target))) return "same";
  const parent = path.dirname(target);
  await fs.mkdir(parent, { recursive: true });
  const tag = randomBytes(4).toString("hex");
  const fresh = path.join(parent, `.gallery-skill-new-${tag}`);
  await fs.cp(source, fresh, { recursive: true });
  if (kind === "absent") {
    if (existsSync(target)) await fs.rmdir(target); // an empty folder (kindOf)
    await rename(fresh, target);
    return "new";
  }
  const old = path.join(parent, `.gallery-skill-old-${tag}`);
  await rename(target, old);
  try {
    await rename(fresh, target);
  } catch (error) {
    await rename(old, target).catch(() => {});
    await fs.rm(fresh, { recursive: true, force: true });
    throw error;
  }
  await fs.rm(old, { recursive: true, force: true });
  return "updated";
}

export async function run(argv, { version }) {
  const { positional, options, values } = commandArguments({ options: ["--project"], values: ["--agent", "--dir"], argv });
  if (positional[0] !== "install") throw new UsageError(positional.length ? `No such skill command: ${positional[0]} (install).` : "Say what to do: gallery skill install.");
  if (positional.length > 1) throw new UsageError(`gallery skill install takes no other argument: ${positional[1]}`);
  const agent = values.get("--agent") ?? null;
  if (agent !== null && !Object.hasOwn(AGENTS, agent)) throw new UsageError(`--agent is claude or codex, not ${agent}.`);
  const dir = values.get("--dir") ?? null;
  if (dir !== null && (agent !== null || options.has("--project"))) throw new UsageError("--dir names the skill's folder itself: not with --agent or --project.");
  const targets = targetsOf({ agent, project: options.has("--project"), dir });

  // Everything looked at first: what each target holds, the older skills to move out, their servers.
  const refusals = [];
  const plans = targets.map((entry) => ({ ...entry, ...kindOf(entry.target) }));
  for (const { target, kind, why } of plans) if (kind === "other") refusals.push(`${target} holds something that is not a Gallery skill (${why}): move it away, or pass --dir <another folder>.`);
  const old = [...new Set(plans.flatMap(({ target, kind, skills }) => [...(kind === "fat" ? [target] : []), ...(skills ? oldSkillsIn(skills) : [])]))];
  for (const folder of old) {
    for (const { pid, port } of serversOf(folder)) {
      refusals.push(Number.isNaN(pid)
        ? `The older Gallery skill ${folder} has a preview server running that this user cannot see: stop it first.`
        : `The older Gallery skill ${folder} has its preview server running (pid ${pid}${port ? `, port ${port}` : ""}): stop it first (close the window that runs it, or end process ${pid}), then run gallery skill install again.`);
    }
  }
  if (refusals.length) {
    for (const line of refusals) console.error(line);
    console.error("Nothing was changed.");
    process.exit(1);
  }

  // The older skills: their documents and exports copied into the workspace, then each moved out of the skills folder.
  if (old.length) {
    const root = reportsDirectory;
    try {
      const { ours, reads } = await ensureWorkspace(root);
      if (!ours) {
        console.error(notOurs(root, reads));
        process.exit(1);
      }
    } catch (error) {
      if (!error.code) throw error;
      console.error(unwritable(root, error.code));
      process.exit(1);
    }
    console.log(`工作区：${root}`);
    for (const folder of old) {
      console.log(`An older Gallery skill (the whole tools) is in ${folder}: its documents go into the workspace, then it moves out of the skills folder.`);
      const reports = path.join(folder, "reports");
      if (isFolder(reports)) {
        const copied = await copyOldDocuments({ from: reports, to: root, state: oldStateOf(folder) });
        for (const line of copiedLines(copied, reports, root)) console.log(`  ${line}`);
      } else console.log("  It holds no documents (no reports/ folder).");
      const exportsFrom = path.join(folder, "exports");
      if (isFolder(exportsFrom)) {
        const exportsTo = layoutOf(root).exports;
        await fs.mkdir(exportsTo, { recursive: true });
        const copied = [];
        const kept = [];
        for (const name of (await fs.readdir(exportsFrom)).filter((file) => file.endsWith(".html")).sort()) {
          try {
            await fs.copyFile(path.join(exportsFrom, name), path.join(exportsTo, name), fs.constants.COPYFILE_EXCL);
            copied.push(name);
          } catch (error) {
            if (error.code !== "EEXIST") throw error;
            kept.push(name);
          }
        }
        if (copied.length) console.log(`  Exports: copied ${plural(copied.length, "file")} into ${exportsTo}: ${copied.join(", ")}`);
        if (kept.length) console.log(`  Exports not copied (the name is taken in ${exportsTo}; they stay in the moved folder's exports/): ${kept.join(", ")}`);
      }
      const { bytes } = await sizeOf(folder);
      const modules = await sizeOf(path.join(folder, "node_modules"));
      const destination = movedFolder(root);
      const failed = await moveFolder(folder, destination);
      if (failed) {
        console.error(`Could not move ${folder} to ${destination} (${failed}). Its documents are copied; move the folder out of the skills folder yourself (it is never needed in it again), then run gallery skill install again.`);
        process.exit(1);
      }
      console.log(`  Moved the old skill to ${destination} (${megabytes(bytes)}${modules.files ? `; its node_modules/, ${megabytes(modules.bytes)}, may be deleted: nothing reads it any more` : ""}).`);
    }
  }

  // The skill, from the package (the release's skill/), or made now from this checkout.
  let source = skillDirectory;
  let made = null;
  if (!release) {
    const { buildSkill } = await import("./package-skill.mjs");
    made = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-skill-"));
    source = path.join(made, "gallery");
    buildSkill(source, { version });
  }
  try {
    let changed = false;
    for (const { agent: key, target } of plans) {
      const kind = kindOf(target).kind; // the old skill there moved out: absent now
      const done = await writeSkill(source, target, kind);
      const whose = key ? ` for ${AGENTS[key].name}` : "";
      if (done === "same") console.log(`The Gallery skill ${version}${whose} is installed already, unchanged: ${target}`);
      else console.log(`${done === "updated" ? "Updated" : "Installed"} the Gallery skill ${version}${whose}: ${target}`);
      changed ||= done !== "same";
    }
    if (changed) console.log("下一步：open a new Agent session to use it.");
  } finally {
    if (made) await fs.rm(made, { recursive: true, force: true });
  }
}
