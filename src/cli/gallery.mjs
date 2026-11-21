import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALIASES, COMMANDS, OVERVIEW, USAGE, helpText } from "./usage.mjs";

// The gallery command (its launcher src/cli/bin.mjs runs this, as does node src/cli/gallery.mjs): `gallery
// <command> [options]`, one module a command (./<command>.mjs, its `run(argv, context)`), loaded only
// when it is the one run, so that help reads nothing but this file, ./usage.mjs (and ./usage-sections.mjs,
// the usage of the commands with subcommands) and package.json, and --version those and ./updates.mjs
// (what it says after the version: a skill older than this gallery,
// a newer Gallery on npm, from a cache it never waits for). Before a command is loaded its workspace
// is found (shared/workspace.mjs: --workspace
// <dir>, which every command takes, anywhere before "--"; init's own <dir>; else GALLERY_WORKSPACE, the
// nearest gallery.json up, else Gallery in the user's Documents folder) and set as GALLERY_WORKSPACE,
// which shared/paths.mjs reads as it is imported and a server the command starts inherits; a command
// that reads or writes documents makes it when it is not there yet (stop never does: it only stops
// what runs) and registers it on the machine's registry of workspaces (gallery workspaces lists them,
// shared/workspace-registry.mjs). Exit codes: what the command says (0 done, 1 failed, 2 the command
// line was wrong, 3 qa could not verify, 4 qa could not look at some places). When a command has ended
// (not with a wrong command line, nor serve, startup, doctor, nor with --json, which is read by a
// program) and something needs handling (a skill installed older than this gallery: ./updates.mjs
// attentionNotes, cheap, files only, nothing under GALLERY_NO_UPDATE_CHECK; a newer Gallery on npm is
// gallery --version's and gallery doctor's to say), one more line follows: `需要处理：…（运行 gallery doctor）`, on stdout, or on
// stderr when the command failed. A command that ends the process itself (process.exit) says none.

const here = path.dirname(fileURLToPath(import.meta.url));

/** Gallery's version: the package.json up from this file named @heycys/gallery (src/cli/ here, dist/ in the release). */
export function versionOf(directory = here) {
  for (let folder = directory; ; folder = path.dirname(folder)) {
    try {
      const metadata = JSON.parse(readFileSync(path.join(folder, "package.json"), "utf8"));
      if (metadata.name === "@heycys/gallery") return metadata.version;
    } catch {}
    if (path.dirname(folder) === folder) return "0.0.0";
  }
}

// The command modules, each loaded only when run (written out, so a bundler finds each one).
const MODULES = {
  init: () => import("./init.mjs"),
  new: () => import("./new.mjs"),
  import: () => import("./import.mjs"),
  open: () => import("./open.mjs"),
  serve: () => import("./serve.mjs"),
  sandbox: () => import("./sandbox.mjs"),
  preview: () => import("./preview.mjs"),
  preferences: () => import("./preferences.mjs"),
  stop: () => import("./stop.mjs"),
  startup: () => import("./startup.mjs"),
  check: () => import("./check.mjs"),
  export: () => import("./export.mjs"),
  qa: () => import("./qa.mjs"),
  list: () => import("./list.mjs"),
  workspaces: () => import("./workspaces.mjs"),
  move: () => import("./move.mjs"),
  set: () => import("./set.mjs"),
  link: () => import("./link.mjs"),
  extension: () => import("./extension.mjs"),
  block: () => import("./component.mjs"),
  page: () => import("./page.mjs"),
  skill: () => import("./skill.mjs"),
  // What the workbench does that an Agent asks for (since 2026-11-11), a module each.
  trash: () => import("./trash.mjs"),
  duplicate: () => import("./duplicate.mjs"),
  copy: () => import("./copy.mjs"),
  favorite: () => import("./favorite.mjs"),
  column: () => import("./column.mjs"),
  notes: () => import("./notes.mjs"),
  read: () => import("./read.mjs"),
  status: () => import("./status.mjs"),
  history: () => import("./history.mjs"),
  revert: () => import("./revert.mjs"),
  doctor: () => import("./doctor.mjs"),
  emoji: () => import("./emoji.mjs"),
};
// The commands that never make a workspace: stop only stops what runs; init makes its own (and says
// so); skill makes it only when it copies an older skill's documents into it; workspaces lists the
// machine's, and makes the current one only to name it (--name); read only reads a document (a
// workspace that is not there has none to read). Every other command registers the
// workspace once it is made (shared/workspace-registry.mjs); init and workspaces register it
// themselves, once there is one, and stop, skill and read never.
const MAKES_NOTHING = new Set(["stop", "startup", "init", "skill", "workspaces", "preview", "doctor", "status", "read"]);

const HELP_LINE = (usage, command) => `${usage.split("\n")[0]}   (gallery ${command ? `${command} --help` : "help"} says more)`;
const isOption = (argument) => /^--.|^-[A-Za-z]/.test(argument);

/**
 * The command line read as the dispatcher reads it, nothing done: { version } for --version, { help:
 * the text to print } for help, { error, usage } for a mistake (exit 2), else { command, argv: its
 * own arguments, flag: the workspace named (--workspace, or init's <dir>) or null }.
 */
export function readCommandLine(argv) {
  const end = argv.indexOf("--");
  const before = end === -1 ? argv : argv.slice(0, end);
  const after = end === -1 ? [] : argv.slice(end);
  // --workspace <dir> or --workspace=<dir>, wherever it is before "--".
  const rest = [];
  let flag = null;
  for (let at = 0; at < before.length; at++) {
    const argument = before[at];
    if (argument === "--workspace" || argument.startsWith("--workspace=")) {
      const value = argument.includes("=") ? argument.slice(argument.indexOf("=") + 1) : at + 1 < before.length && !isOption(before[at + 1]) ? before[++at] : "";
      if (!value) return { error: "--workspace takes a folder: --workspace <dir>", usage: OVERVIEW };
      if (flag !== null && path.resolve(flag) !== path.resolve(value)) return { error: `Two workspaces named: ${flag} and ${value}.`, usage: OVERVIEW };
      flag = value;
      continue;
    }
    rest.push(argument);
  }
  if (rest[0] === "--version" || rest[0] === "-v" || rest[0] === "-V") return rest.length === 1 && after.length === 0 ? { version: true } : { error: "--version takes nothing else.", usage: OVERVIEW };
  if (rest.length === 0 || rest[0] === "help" || rest[0] === "--help" || rest[0] === "-h") {
    const named = rest[0] === "help" ? rest[1] : undefined;
    if (named === undefined) return { help: OVERVIEW };
    if (!Object.hasOwn(USAGE, named)) return { error: `No such command: ${named} (${COMMANDS.join(", ")}).`, usage: OVERVIEW };
    // gallery help <command> [<subcommand>]: a command with subcommands (block, page) says a line for each, or one in full (./usage.mjs helpText).
    const asked = helpText(named, rest.slice(2).find((argument) => !isOption(argument)));
    if (asked.unknown) return { error: `No such ${ALIASES[named] ?? named} command: ${rest.slice(2).find((argument) => !isOption(argument))} (${asked.unknown.join(", ")}).`, usage: USAGE[named], command: ALIASES[named] ?? named };
    return { help: asked.text };
  }
  const [written, ...own] = rest;
  const command = ALIASES[written] ?? written;
  if (!Object.hasOwn(MODULES, command)) {
    return { error: isOption(command) ? `Unknown option: ${command} (the command comes first: gallery <command> [options]).` : `No such command: ${command} (${COMMANDS.join(", ")}).`, usage: OVERVIEW };
  }
  const commandArgv = [...own, ...after];
  // gallery <command> --help, and gallery <command> <subcommand> --help of a command with subcommands: that subcommand alone.
  if (own.some((argument) => argument === "--help" || argument === "-h")) {
    const asked = helpText(command, own[0] !== undefined && !isOption(own[0]) ? own[0] : undefined);
    return { help: asked.text ?? helpText(command).text };
  }
  // init's <dir> is its workspace: read before anything computes a path of the workspace found.
  if (command === "init") {
    const values = new Set(["--from", "--name"]);
    const positional = [];
    for (let at = 0; at < own.length; at++) {
      if (values.has(own[at])) at++;
      else if (!isOption(own[at])) positional.push(own[at]);
    }
    positional.push(...after.slice(1));
    if (positional.length > 1) return { error: "Name one folder at most.", usage: USAGE.init, command };
    if (positional.length === 1) {
      if (flag !== null && path.resolve(flag) !== path.resolve(positional[0])) return { error: `Two workspaces named: ${positional[0]} and --workspace ${flag}.`, usage: USAGE.init, command };
      flag = positional[0];
    }
  }
  return { command, argv: commandArgv, flag };
}

/** What a command prints when the workspace cannot be written, and when its gallery.json is another program's or, `reads` false, no JSON at all. */
export const unwritable = (root, code) => `Cannot write the workspace ${root} (${code}): allow Gallery to write there, or pass --workspace <a folder you may write>.`;
export const notOurs = (root, reads = true) => (reads
  ? `${path.join(root, "gallery.json")} is not Gallery's (another program's file of that name): pass --workspace <another folder> for Gallery's documents.`
  : `${path.join(root, "gallery.json")} does not read as JSON: mend the file, or pass --workspace <another folder> for Gallery's documents.`);

// The commands that say nothing of what needs handling: doctor says it all, serve and startup are run by
// programs (a server's process), --json is a program's.
const NO_NOTICE = new Set(["doctor", "serve", "startup"]);

/** The line a finished command ends with when something needs handling (`需要处理：…`), or null. */
export async function attentionLine(command, argv, version = versionOf()) {
  const own = argv.includes("--") ? argv.slice(0, argv.indexOf("--")) : argv;
  if (NO_NOTICE.has(command) || own.includes("--json")) return null;
  try {
    const { attentionNotes, galleryRun, viaNpx } = await import("./updates.mjs");
    const notes = attentionNotes(version);
    return notes.length ? `需要处理：${notes.join("；")}（运行 ${galleryRun("doctor", version, viaNpx())}）` : null;
  } catch {
    return null;
  }
}

/** Run the gallery command line `argv`. */
export async function main(argv = process.argv.slice(2)) {
  // A reader that stops reading (gallery list | head): the command ends quietly, not with a stack.
  process.stdout.on("error", (error) => {
    if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw error;
  });
  const read = readCommandLine(argv);
  if (read.version) {
    // The version first, alone on its line (scripts read it); then what is newer, when anything is (./updates.mjs).
    const version = versionOf();
    console.log(version);
    try {
      const { versionNotes } = await import("./updates.mjs");
      for (const line of versionNotes(version)) console.log(line);
    } catch {}
    return;
  }
  if (read.help) return void console.log(read.help);
  if (read.error) {
    console.error(`${read.error}\n${HELP_LINE(read.usage, read.command)}`);
    process.exit(2);
  }
  const { command, flag } = read;
  const { UsageError, usageFailureText } = await import("./arguments.mjs");
  const run = async (context) => {
    try {
      const module = await MODULES[command]();
      await module.run(read.argv, { command, version: versionOf(), ...context });
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(usageFailureText(USAGE[command], error.message, error.synopsis));
      process.exitCode = 2;
    }
  };
  // A sandbox selects its own directories before loading any code that reads them.
  if (command === "sandbox") return run({ flag });
  const { findWorkspace, defaultWorkspace } = await import("../shared/workspace.mjs");
  // Blocks, pages, extensions and preferences are home's; the documents a block command tries or
  // looks at are where gallery open finds them (block try runs there; check --documents reads both).
  const documents = findWorkspace({ flag });
  const homeOnly = ["page", "block", "extension", "preferences"].includes(command) && !(command === "block" && read.argv.find((word) => !word.startsWith("-")) === "try");
  const workspace = homeOnly ? { root: defaultWorkspace(), how: "default" } : documents;
  if (process.env.GALLERY_SANDBOX && workspace.root !== defaultWorkspace()) {
    console.error("Sandbox commands must use the sandbox workspace.");
    process.exitCode = 2;
    return;
  }
  if (process.env.GALLERY_SANDBOX && command === "serve") {
    console.error("Use gallery sandbox to start a sandbox service.");
    process.exitCode = 2;
    return;
  }
  // Every module the command loads reads its paths from here (shared/paths.mjs), and so does a server it starts.
  process.env.GALLERY_WORKSPACE = workspace.root;
  if (!MAKES_NOTHING.has(command)) {
    const { ensureWorkspace } = await import("../shared/workspace.mjs");
    try {
      await ensureWorkspace(defaultWorkspace());
      const { ours, reads } = await ensureWorkspace(workspace.root, { state: command !== "init" || workspace.root === defaultWorkspace() });
      if (!ours) {
        console.error(notOurs(workspace.root, reads));
        process.exit(1);
      }
    } catch (error) {
      if (!error.code) throw error;
      console.error(unwritable(workspace.root, error.code));
      process.exit(1);
    }
    // Register every explicitly used workspace; pass over a registry that cannot be written.
    const { registerQuietly } = await import("../shared/workspace-registry.mjs");
    await registerQuietly(workspace.root);
  }
  await run({ workspace: workspace.root, how: workspace.how, documents: documents.root });
  if (process.exitCode !== 2) {
    const line = await attentionLine(command, read.argv);
    if (line) (process.exitCode ? console.error : console.log)(line);
  }
}

// Run itself (node src/cli/gallery.mjs), the dispatcher runs the command line as src/cli/bin.mjs has it
// run, but for the word on the Node it needs; imported, it runs nothing.
const realOf = (file) => {
  try {
    return realpathSync.native(file);
  } catch {
    return null;
  }
};
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) main();
