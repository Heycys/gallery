import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { namedPlace } from "../shared/page-address.mjs";
import { pageLinks } from "../shared/page-links.mjs";
import { RESERVED, isSlugName, listTrash, slugPattern } from "../shared/workspace.mjs";

// The command line of a gallery command (and of a maintainers' script), read before the command
// reads or writes anything, so that a mistake in it never reaches a document. A command's usage is
// its text in ./usage.mjs (a maintainers' script's, the comment at the top of its file: usageOf),
// whose first line starts "Usage:"; --help or -h prints it and exits 0 (the gallery command answers
// those itself, before it loads the command). A mistake (an option the command does not take, a
// wrong number of arguments…) exits 2, said first, then one line, the usage's first with where the
// rest is (--help): the reason was buried under the whole usage. An option is an argument starting
// with "--", or with "-" and a letter; every other argument is a positional one (a document's slug,
// a title such as "-5% 的增长"), and after "--" every argument is. A command of documents processes
// those it names, or every one with --all (check: every one when it names none). A document is named
// by its slug, by its link or by a whole address (documentNamed), which is what a person hands an
// Agent; naming one by anything else is a mistake, which could reach another document's file
// ("Natural" is natural/ where case is ignored) or one outside the workspace ("../x"). An option
// that takes a value (qa's --blocks) takes the argument after it, or what follows its "=".

/** Whether an argument is an option: "--" and more, or "-" and a letter. */
export const isOption = (argument) => /^--.|^-[A-Za-z]/.test(argument);

/**
 * A mistake in a command line: said with the command's usage line, exit 2 (gallery.mjs prints it), or
 * with `synopsis` where one is set, the lines of the part of the command it is a mistake in.
 */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

/** The comment lines at the top of a maintainers' script (`script`: its import.meta.url), without their slashes. */
export function usageOf(script) {
  const lines = fs.readFileSync(fileURLToPath(script), "utf8").split(/\r?\n/);
  const end = lines.findIndex((line) => !line.startsWith("//"));
  return lines.slice(0, end === -1 ? lines.length : end).map((line) => line.replace(/^\/\/ ?/, "")).join("\n");
}

// The command a usage names ("gallery qa", "npm run skill:package") and its first line.
const commandOf = (usage) => /^Usage: (gallery \S+|npm run \S+|node \S+)/.exec(usage)?.[1] ?? "this command";
const firstUsageLine = (usage) => usage.split("\n")[0];

/**
 * What a usage failure prints (`usage`: the command's text): `message`, then the usage's first line, or
 * `synopsis` (a UsageError's, the lines of a part of the command), and where the rest is.
 */
export const usageFailureText = (usage, message, synopsis = firstUsageLine(usage)) => {
  const command = commandOf(usage);
  return `${message}\n${synopsis}   (${command}${command.startsWith("npm run") ? " --" : ""} --help says more)`;
};

/** Whether `argv` asks for the usage: --help or -h before any "--". */
export const asksHelp = (argv) => {
  const end = argv.indexOf("--");
  return (end === -1 ? argv : argv.slice(0, end)).some((argument) => argument === "--help" || argument === "-h");
};

/**
 * The arguments of a command that takes the options `options` and the options with a value
 * `values`: `{ positional, options, values }`, the options given as a Set, those with a value as a
 * Map. An option it does not take and one without its value throw a UsageError.
 */
export function commandArguments({ options = [], values = [], repeated = [], argv = process.argv.slice(2) } = {}) {
  const end = argv.indexOf("--");
  const [before, after] = end === -1 ? [argv, []] : [argv.slice(0, end), argv.slice(end + 1)];
  const positional = [];
  const given = new Set();
  const valued = new Map();
  for (let at = 0; at < before.length; at++) {
    const argument = before[at];
    const [name, written] = argument.startsWith("--") && argument.includes("=") ? [argument.slice(0, argument.indexOf("=")), argument.slice(argument.indexOf("=") + 1)] : [argument, undefined];
    if (!isOption(argument)) positional.push(argument);
    else if (values.includes(name) || repeated.includes(name)) {
      const value = written ?? (at + 1 < before.length && !isOption(before[at + 1]) ? before[++at] : undefined);
      if (!value) throw new UsageError(`${name} takes a value`);
      if (repeated.includes(name)) valued.set(name, [...(valued.get(name) ?? []), value]);
      else valued.set(name, value);
    } else if (options.includes(argument)) given.add(argument);
    else throw new UsageError(`Unknown option: ${argument}`);
  }
  return { positional: [...positional, ...after], options: given, values: valued };
}

/**
 * Whether gallery new, import and duplicate open the default browser at the document
 * (server-process.mjs browserLine): only when --open asks, and then they say whether it opened; else
 * they open none and say nothing of it. The Agent sends the user the address (their 下一步 line), and
 * the workbench marks a page an Agent changed with a blue dot, so no tab need open by itself: a tab of
 * a blank document opened the moment an Agent made it, before a word was written (the user,
 * 2026-11-13). Until then they opened it unless --no-browser, so that the user saw the document
 * written whether or not the Agent sent the address (testing the skill with Agents, 2026-10-30: the Sonnet write
 * runs sent it only in their handoff, 4 times of 6). --no-browser is still taken (the skills of before
 * pass it) and does nothing more; with --open, a mistake of the command line, said before anything is
 * made.
 */
export function openAsked(options) {
  if (options.has("--open") && options.has("--no-browser")) throw new UsageError("--open and --no-browser say opposite things: give one.");
  return options.has("--open");
}

/** Throw a UsageError unless `slug` is a document's slug (lowercase kebab-case, not a reserved name). */
export function checkSlug(slug) {
  if (!slugPattern.test(slug)) throw new UsageError(`Not a document's slug: ${slug} (lowercase kebab-case).`);
  if (RESERVED.has(slug)) throw new UsageError(`Not a document's slug: ${slug} (a name the workspace keeps for itself).`);
  return slug;
}

/**
 * What is said of `name` when it names a document of the trash, with its title, or a custom page of
 * the trash by its slug (no document, which the trash holds too: shared/workspace.mjs listTrash); else null.
 */
export async function inTrashSaid(name) {
  const { reportsDirectory } = await import("../shared/paths.mjs");
  const trash = await listTrash(reportsDirectory);
  const documents = trash.filter(({ kind }) => kind === "document");
  const binned = namedPlace(name, pageLinks(documents));
  if (binned) return `${name} is a document in the trash ("${documents.find(({ slug }) => slug === binned.slug).title}"): it has to be restored in the workbench first.`;
  const page = trash.find(({ kind, slug }) => kind === "page" && slug === name);
  return page ? `${name} is a custom page in the trash ("${page.title}"), not a document: once it is restored in the workbench, gallery page open ${name} --no-browser gives its address.` : null;
}

/**
 * The document `name` names, as { slug, block }: a slug, a link as it stands after the # of an address
 * (周报-k3xv9q2a, its page id alone), or a whole address with a block or without, on any port of this
 * computer (shared/page-address.mjs). A slug no document holds comes back as it is, for the command to
 * say so. A document in the trash, and what names no document, throw a UsageError.
 */
export async function documentNamed(name) {
  const { listReportSlugs } = await import("../shared/reports.mjs");
  const slugs = (await listReportSlugs()).filter(isSlugName); // a folder named by no slug is no command's
  const place = namedPlace(name, pageLinks(slugs.map((slug) => ({ slug }))));
  if (place) return place;
  const binned = await inTrashSaid(name);
  if (binned) throw new UsageError(binned);
  if (!slugPattern.test(name)) throw new UsageError(`Not a document's slug, link or address: ${name} (gallery list shows them).`);
  return { slug: checkSlug(name), block: null };
}

/**
 * The documents a command of documents processes (`slugs`) and the other options it was given
 * (`options`, of those it takes besides --all; `values`, those with a value; `repeated`, those with a value
 * that may be given more than once, each a list of what was given): those it names, each
 * as documentNamed reads it, or every document of the workspace with --all, or (`noneIsAll`: check)
 * when it names none. Naming none (but with `noneIsAll`), naming some and passing --all, or naming
 * one by what names no document throws a UsageError.
 */
export async function documentArguments({ options = [], values = [], repeated = [], argv, noneIsAll = false } = {}) {
  const { listReportSlugs } = await import("../shared/reports.mjs");
  const { positional, options: given, values: valued } = commandArguments({ options: ["--all", ...options], values, repeated, argv });
  const all = given.has("--all");
  if (all && positional.length > 0) throw new UsageError("Name documents or pass --all, not both.");
  if (!all && positional.length === 0 && !noneIsAll) throw new UsageError("Name a document (or pass --all).");
  const named = await Promise.all(positional.map(documentNamed));
  return { slugs: all || positional.length === 0 ? await listReportSlugs() : [...new Set(named.map(({ slug }) => slug))], options: given, values: valued };
}

/**
 * For a maintainers' script run by node (its usage the comment at the top of its file): its
 * arguments as commandArguments or documentArguments (`documents`) read them, --help printing the
 * usage and exiting 0, a mistake said with the usage line and exiting 2.
 */
export async function scriptArguments(script, { documents = false, ...spec } = {}) {
  const usage = usageOf(script);
  const argv = spec.argv ?? process.argv.slice(2);
  if (asksHelp(argv)) {
    console.log(usage);
    process.exit(0);
  }
  try {
    return documents ? await documentArguments({ ...spec, argv }) : commandArguments({ ...spec, argv });
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(usageFailureText(usage, error.message));
    process.exit(2);
  }
}
