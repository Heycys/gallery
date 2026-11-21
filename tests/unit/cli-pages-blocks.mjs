import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readCommandLine } from "../../src/cli/gallery.mjs";
import { BLOCK_SECTIONS, PAGE_SECTIONS, wholeUsage } from "../../src/cli/usage-sections.mjs";
import { ALIASES, COMMANDS, PACK_SYNOPSIS, PAGE_TRY_SYNOPSIS, TRY_SYNOPSIS, USAGE, helpText, synopsisOf } from "../../src/cli/usage.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { portIsFree } from "../../src/shared/preview-server.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";

// What an Agent the user asks does to custom pages and the component list's switches (decided
// 2026-11-11; src/cli/page.mjs, page-manage.mjs, component.mjs,
// component-switches.mjs, usage-sections.mjs):
//  - gallery page set (title, icon, none; the rest of page.json as it was), move (--after, --first, the head
//    kept in the outline file), card (--set held to the block's types, --move, --size, --remove, several in one
//    command, a card changed meanwhile read again) and reset-cards (the page menu's 恢复默认卡片), each with no
//    server (the page service's own code here) and through a running server (its queue), and list: a page in the
//    trash is not listed, and --json is one object;
//  - gallery block list --json, pack list --json, pack on|off, menu on|off (a custom block, a block of pages
//    alone, a built-in block, one that cannot be taken out) and net on|off (the websites printed first, only a
//    block whose needs name some), each as the dialog's switches write gallery.json;
//  - the help of a command with subcommands: gallery help block / page a line for each subcommand, gallery help
//    block pack (and gallery block pack --help) that one in full, every option still said, a command with no
//    sections printed whole.

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");

// ---------- the help, by subcommand ----------
{
  // What the usage of block and page said before it was kept by subcommand: every option it named. Each is still said,
  // by the whole usage and by the subcommand that takes it.
  const BEFORE = {
    block: ["--data", "--documents", "--drag", "--flow", "--keep", "--key", "--page", "--press", "--recipe", "--remove", "--replace", "--script", "--select", "--steps", "--then", "--to", "--type"],
    page: ["--board", "--drag", "--h", "--keep", "--key", "--no-browser", "--press", "--replace", "--select", "--set", "--steps", "--then", "--to", "--type", "--w", "--x", "--y"],
  };
  // Where each of them is said in full.
  const TAKEN_BY = {
    block: { "--data": "new", "--flow": "new", "--page": "new", "--script": "new", "--recipe": "new", "--documents": "check", "--remove": "key", "--press": "try", "--drag": "try", "--to": "try", "--key": "try", "--type": "try", "--select": "try", "--steps": "try", "--then": "try", "--keep": "try", "--replace": "try" },
    page: { "--board": "add", "--x": "add", "--y": "add", "--w": "add", "--h": "add", "--set": "add", "--no-browser": "open", "--press": "try", "--drag": "try", "--to": "try", "--key": "try", "--type": "try", "--select": "try", "--steps": "try", "--then": "try", "--keep": "try", "--replace": "try" },
  };
  const options = (text) => new Set([...text.matchAll(/--[a-z][a-z-]*/g)].map(([option]) => option));
  for (const [command, sections] of [["block", BLOCK_SECTIONS], ["page", PAGE_SECTIONS]]) {
    const names = sections.subs.map((sub) => sub.name);
    const whole = USAGE[command];
    assert.equal(whole, wholeUsage(sections), `${command}: USAGE is the whole of the sections`);
    assert.ok(whole.startsWith(`Usage: gallery ${command} new`) || whole.startsWith(`Usage: gallery ${command} <`) || whole.startsWith(`Usage: gallery ${command} `), `${command}: its first line is a usage line, which a mistake in a command line shows`);
    const overview = readCommandLine(["help", command]).help;
    assert.equal(overview, helpText(command).text);
    assert.equal(readCommandLine([command, "--help"]).help, overview, `${command} --help is gallery help ${command}`);
    assert.equal(readCommandLine([command, "-h"]).help, overview);
    assert.ok(overview.startsWith(`Usage: gallery ${command} <command> [options]`), `${command}: the overview's first line`);
    assert.ok(overview.length < 3500 && overview.length < whole.length / 3, `${command}: the overview is short (${overview.length} of ${whole.length} characters)`);
    // A line for each subcommand, each one line.
    const listed = overview.split("\n").filter((line) => /^ {2}[a-z]/.test(line));
    assert.deepEqual(listed.map((line) => line.trim().split(/\s+/)[0]), names, `${command}: a line for each subcommand, in order`);
    for (const line of listed) assert.ok(line.length < 140, `${command}: one short line: ${line}`);
    assert.ok(overview.includes(`gallery help ${command} <command> prints one in full`), `${command}: and says how to see one`);
    // Each subcommand alone: gallery help <command> <sub>, gallery <command> <sub> --help, gallery component <sub> --help.
    for (const sub of sections.subs) {
      const alone = readCommandLine(["help", command, sub.name]).help;
      assert.equal(alone, helpText(command, sub.name).text);
      assert.equal(readCommandLine([command, sub.name, "--help"]).help, alone, `${command} ${sub.name} --help`);
      assert.equal(readCommandLine([command, sub.name, "-h"]).help, alone);
      assert.equal(readCommandLine(["help", command, sub.name, "--bogus"]).help, alone, "an option after the subcommand does not matter");
      assert.ok(alone.startsWith(`Usage: gallery ${command} ${sub.name}`), `${command} ${sub.name}: it starts with its usage line`);
      assert.ok(alone.length < whole.length, `${command} ${sub.name}: shorter than the whole`);
      assert.ok(!alone.includes("Usage: gallery " + command + " " + names.find((name) => name !== sub.name && !sub.name.startsWith(name) && name !== "pack")), `${command} ${sub.name}: only its own usage lines`);
      assert.ok(alone.includes(sub.text), `${command} ${sub.name}: its text whole`);
      assert.ok(alone.trimEnd().endsWith(`gallery help ${command} says what a ${command} is and lists the other commands.`));
      // Every option its own lines name is in its text.
      for (const option of options(sub.usage.join("\n"))) assert.ok(alone.includes(option), `${command} ${sub.name}: ${option}`);
    }
    // Nothing is lost: every option the usage named is still in the whole, and in the subcommand that takes it.
    for (const option of BEFORE[command]) {
      assert.ok(options(whole).has(option), `${command}: ${option} is in the whole usage`);
      if (TAKEN_BY[command][option]) assert.ok(options(helpText(command, TAKEN_BY[command][option]).text).has(option), `${command}: ${option} is said by ${TAKEN_BY[command][option]}`);
    }
    // The union of the subcommands' texts and the intro is the whole usage (a line each, in any order).
    const union = [overview.split("\n\nCommands")[0].split("\n").slice(1), ...sections.subs.map((sub) => helpText(command, sub.name).text.split("\n").slice(sub.usage.length, -1))].flat();
    const wholeLines = whole.split("\n").slice(sections.subs.flatMap((sub) => sub.usage).length);
    assert.deepEqual([...union].sort(), [...wholeLines].sort(), `${command}: the intro and the subcommands' lines are all the usage's lines`);
    // Its subcommands are among its usage lines (the documents' commands are held to them: tests/unit/skill-docs.mjs).
    for (const name of names) assert.ok(new RegExp(`^(?:Usage:|\\s)\\s*gallery ${command} (?:[a-z-]+\\|)*${name}(?:[ |]|$)`, "m").test(whole), `${command} ${name}: a usage line`);
  }
  // Sentences of the old usage, each said by its own subcommand (the last of each paragraph, where the exit codes are).
  for (const [command, sub, said] of [
    ["block", "new", "every word that named it naming the new id, its version 0.1.0"], ["block", "new", "recipe Gallery has none of, or options that do not go together."],
    ["block", "add", "and never one changed since."], ["block", "list", "and last the built-in blocks the user took out of the document's menus."],
    ["block", "show", "and ends with the gallery block add <name> line that puts it in."], ["block", "check", "Exits 2 for an id no block can have."],
    ["block", "try", "Exits 1 when no step wrote anything"], ["block", "try", "the line saying what the file held."], ["block", "key", "A key is never printed."],
    ["block", "pack", "pack remove takes out a pack installed"], ["block", "pack", "put there)."],
    ["page", "new", "so in place of \"no such page\"."], ["page", "list", "only that the home page waits for the server."], ["page", "open", "Exits 1 when there is no such page or no server answers."],
    ["page", "add", "Exits 1 when there is no such page or board"], ["page", "try", "Exits as gallery block try does"], ["page", "check", "the page then what the next check tells its changes against."],
  ]) assert.ok(helpText(command, sub).text.replace(/\s+/g, " ").includes(said), `${command} ${sub} still says ${said}`);
  // The other name of block (gallery component) says the same, and an unknown subcommand is a mistake that says which there are.
  assert.equal(ALIASES.component, "block");
  assert.deepEqual(readCommandLine(["help", "component", "pack"]), { help: helpText("block", "pack").text });
  assert.equal(readCommandLine(["component", "pack", "--help"]).help, helpText("block", "pack").text);
  assert.equal(readCommandLine(["block", "bogus", "--help"]).help, helpText("block").text, "--help of what is no subcommand: the command's");
  const unknown = readCommandLine(["help", "block", "bogus"]);
  assert.deepEqual([unknown.error, unknown.command, unknown.usage], [`No such block command: bogus (${BLOCK_SECTIONS.subs.map((sub) => sub.name).join(", ")}).`, "block", USAGE.block]);
  assert.equal(readCommandLine(["help", "page", "bogus"]).error, `No such page command: bogus (${PAGE_SECTIONS.subs.map((sub) => sub.name).join(", ")}).`);
  // A command with no sections is printed whole, whatever follows its name.
  for (const command of COMMANDS.filter((name) => !["block", "page"].includes(name))) {
    assert.deepEqual(readCommandLine(["help", command]), { help: USAGE[command] }, `gallery help ${command}`);
    assert.deepEqual(readCommandLine(["help", command, "list"]), { help: USAGE[command] }, `gallery help ${command} list: the whole entry`);
    assert.deepEqual(readCommandLine([command, "list", "--help"]), { help: USAGE[command] }, `gallery ${command} list --help`);
  }
  // The usage lines a mistake is said with.
  assert.ok(TRY_SYNOPSIS.startsWith("Usage: gallery block try ") && TRY_SYNOPSIS.split("\n").length === 6);
  assert.deepEqual(PACK_SYNOPSIS.split("\n").map((line) => line.trim().replace(/^Usage: /, "")), ["gallery block pack install <folder|zip>", "gallery block pack list [--json]", "gallery block pack remove <pack>", "gallery block pack on|off <pack>"]);
  assert.ok(PAGE_TRY_SYNOPSIS.startsWith("Usage: gallery page try ") && PAGE_TRY_SYNOPSIS.split("\n").length === 6);
  assert.equal(synopsisOf("block", "menu"), "Usage: gallery block menu on|off <block>");
  assert.equal(synopsisOf("component", "net"), "Usage: gallery block net on|off <block>");
  assert.equal(synopsisOf("page", "card"), ["Usage: gallery page card <slug> <card id> [--set <key>=<value>]… [--move <x>,<y>] [--size <w>,<h>] [--narrow]", "       gallery page card <slug> <card id> --remove"].join("\n"));
  assert.equal(synopsisOf("page", "bogus"), null);
  assert.equal(synopsisOf("qa", "x"), null, "a command with no sections has none");
  // What the new subcommands say of their output: the --json fields.
  for (const [command, sub, said] of [["block", "list", '"blocks"'], ["block", "list", '"available"'], ["block", "list", '"builtin"'], ["block", "pack", '"packs"'], ["page", "list", '"pages"'], ["page", "list", '"homeNotMade"']]) assert.ok(helpText(command, sub).text.includes(said), `${command} ${sub} says its --json's ${said}`);
}

// ---------- the commands, in a workspace of the test's own ----------
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-pages-blocks-"));
const workspace = path.join(root, "home");
const data = path.join(root, "data");
const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 5320, 5399]).slice(1).map(Number);
async function freePort() {
  for (let port = high; port >= low; port--) if (await portIsFree(port)) return port;
  throw new Error(`No free port in ${low}-${high}`);
}
let serverPort = null;
// The command as a user runs it; the default workspace is the test's (gallery page and gallery block work in it).
const gallery = async (args, env = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...args], {
      cwd: root,
      env: { ...process.env, GALLERY_WORKSPACE: workspace, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data, GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_NO_PREVIEW: "1", GALLERY_NO_DEFAULT_TREE: "1", GALLERY_NO_DEFAULT_HOME: "1", ...(serverPort ? { GALLERY_PORT: String(serverPort) } : {}), ...env },
      maxBuffer: 1 << 24,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const json = (result) => {
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, "");
  assert.ok(result.stdout.startsWith("{\n  "), "one JSON object, 2-space indented");
  return JSON.parse(result.stdout);
};
const read = (...parts) => fs.readFileSync(path.join(workspace, ...parts), "utf8");
const pageJson = (slug) => JSON.parse(read("pages", slug, "page.json"));
const pageHtml = (slug) => read("pages", slug, "page.html");
const slugsOf = async () => json(await gallery(["page", "list", "--json"])).pages.map((page) => page.slug);
const settingsOf = () => JSON.parse(read("gallery.json"));
const cardsIn = (slug) => [...pageHtml(slug).matchAll(/<section\b[^>]*\bgallery-card\b[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/data-(card-id|x|y|w|h)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
const blockOf = (slug, id) => new RegExp(`<section[^>]*data-card-id="${id}"[\\s\\S]*?data-doc-component="([^"]+)"`).exec(pageHtml(slug))?.[1];
const cardOf = (slug, id) => cardsIn(slug).find((card) => card["card-id"] === id);
const cellsOf = (card) => ["x", "y", "w", "h"].map((key) => Number(card[key])).join(",");

try {
  assert.equal((await gallery(["init", workspace])).code, 0);

  // ===== gallery page: list, new, set =====
  for (const [slug, title] of [["board", "看板"], ["notes", "笔记"], ["inbox", "收件"]]) assert.equal((await gallery(["page", "new", slug, title])).code, 0);
  assert.deepEqual(await slugsOf(), ["board", "notes", "inbox"], "each page made last");
  const listing = json(await gallery(["page", "list", "--json"]));
  assert.deepEqual(Object.keys(listing), ["workspace", "server", "pages", "homeNotMade"]);
  assert.deepEqual([listing.workspace, listing.server, listing.homeNotMade], [path.resolve(workspace), null, false]);
  assert.deepEqual(listing.pages[0], { slug: "board", title: "看板", icon: null, defaultCards: false, address: "/#@board", file: path.resolve(workspace, "pages", "board", "page.html") });
  const text = await gallery(["page", "list"]);
  assert.match(text.stdout, /^- board {2}看板\n {2}地址：\/#@board /m, "the text list is as it was");
  assert.equal((await gallery(["page", "list", "--json", "extra"])).code, 2);
  assert.match((await gallery(["page", "add", "board", "gallery/note", "--json"])).stderr, /^--json goes with list, not add\./);
  // A page in the trash is not listed (the sidebar's 移至回收区, which gallery trash calls too).
  assert.equal((await createWorkspaceService({ edits: {}, reports: {}, reportsDirectory: workspace }).run("trash", { slug: "inbox", kind: "page" }))[1].ok, true);
  assert.deepEqual(await slugsOf(), ["board", "notes"], "a page in the trash is not listed");
  assert.ok(!(await gallery(["page", "list"])).stdout.includes("inbox"));

  // set: the title and the icon in page.json, every other field as it was, page.html left alone.
  fs.writeFileSync(path.join(workspace, "pages", "notes", "page.json"), `${JSON.stringify({ title: "笔记", note: "mine", hint: true }, null, 2)}\n`);
  const htmlBefore = pageHtml("notes");
  let done = await gallery(["page", "set", "notes", "--title", "  我的   笔记 ", "--icon", "📒"]);
  assert.equal(done.code, 0, done.stderr);
  assert.deepEqual(pageJson("notes"), { title: "我的 笔记", note: "mine", hint: true, icon: "📒" }, "title (blanks tidied) and icon, the rest as it was");
  assert.equal(pageHtml("notes"), htmlBefore, "page.html is not touched");
  assert.match(done.stdout, /^Set the page notes \(page\.json\):\n {2}title: "笔记" → "我的 笔记"\n {2}icon: none → "📒"\n提示：page\.html's own <title>/);
  assert.equal(json(await gallery(["page", "list", "--json"])).pages.find((page) => page.slug === "notes").icon, "📒");
  done = await gallery(["page", "set", "notes", "--icon", "/icons/airplane_blue.svg"]);
  assert.equal(pageJson("notes").icon, "/icons/airplane_blue.svg", "an icon of the 图标 tab");
  assert.ok(!done.stdout.includes("提示："), "no word about <title> when the title stayed");
  done = await gallery(["page", "set", "notes", "--icon", "none"]);
  assert.deepEqual(pageJson("notes"), { title: "我的 笔记", note: "mine", hint: true });
  done = await gallery(["page", "set", "notes", "--title", "我的 笔记"]);
  assert.equal(done.stdout, "Nothing to change: notes has that already.\n");
  for (const [args, said] of [
    [["page", "set", "notes"], /^Say what to set/],
    [["page", "set"], /^Name one page, then what to set/],
    [["page", "set", "notes", "--title", "  "], /^--title takes the words of the title/],
    [["page", "set", "notes", "--title", "x".repeat(201)], /^A page's title is 200 characters at most\./],
    [["page", "set", "notes", "--icon", "word"], /^Not an icon a custom page takes: word/],
    [["page", "set", "notes", "--icon", "assets/icon-1a2b3c4d.png"], /^Not an icon a custom page takes/],
    [["page", "set", "notes", "--icon", "/icons/nothing-at-all_blue.svg"], /^No such icon of the 图标 tab/],
    [["page", "list", "--title", "x"], /^--title goes with set, not list\./],
  ]) {
    const refused = await gallery(args);
    assert.equal(refused.code, 2, args.join(" "));
    assert.match(refused.stderr, said, args.join(" "));
    assert.ok(refused.stderr.includes("Usage: gallery page " + (args[1] === "set" ? "set <slug>" : "new")), `${args.join(" ")}: the usage line of the subcommand`);
  }
  assert.deepEqual(pageJson("notes"), { title: "我的 笔记", note: "mine", hint: true }, "a refusal writes nothing");
  const noPage = await gallery(["page", "set", "nope", "--title", "x"]);
  assert.deepEqual([noPage.code, /^No custom page "nope"/.test(noPage.stderr)], [1, true]);

  // ===== move: the sidebar head's order =====
  assert.deepEqual(await slugsOf(), ["board", "notes"]);
  assert.match((await gallery(["page", "move", "notes", "--first"])).stdout, /^Moved the page notes to the first place among the pages in the sidebar's head\.\nPages, in the sidebar's order: notes, board\n$/);
  assert.deepEqual(await slugsOf(), ["notes", "board"]);
  await gallery(["page", "new", "extra", "额外"]);
  assert.match((await gallery(["page", "move", "notes", "--after", "board"])).stdout, /^Moved the page notes after board in the sidebar's head\./);
  assert.deepEqual(await slugsOf(), ["board", "notes", "extra"]);
  const head = JSON.parse(read(".gallery", "outline.json")).head;
  assert.deepEqual(head.filter((key) => key.startsWith("@")), ["@board", "@notes", "@extra"], "kept in the outline file");
  assert.ok(head.indexOf("new") < head.indexOf("@board") && head.indexOf("search") < head.indexOf("@board"), "新建 and 搜索 stay where they were");
  assert.equal((await gallery(["page", "move", "notes", "--after", "board"])).stdout, "notes is there already.\nPages, in the sidebar's order: board, notes, extra\n", "a page that is there changes nothing");
  assert.deepEqual((await gallery(["page", "move", "board", "--first"])).stdout.split("\n")[0], "board is there already.");
  assert.equal((await gallery(["page", "move", "extra", "--after", "board"])).code, 0);
  assert.deepEqual(await slugsOf(), ["board", "extra", "notes"]);
  for (const [args, code, said] of [
    [["page", "move", "notes"], 2, /^Say where it goes: --after <page> or --first\./],
    [["page", "move", "notes", "--first", "--after", "board"], 2, /^--after and --first are two places/],
    [["page", "move"], 2, /^gallery page move takes one page's slug\./],
    [["page", "move", "notes", "--after", "notes"], 1, /^notes cannot go after itself\./],
    [["page", "move", "notes", "--after", "nope"], 1, /^No page "nope" to put notes after/],
    [["page", "move", "nope", "--first"], 1, /^No custom page "nope"/],
    [["page", "move", "inbox", "--first"], 1, /^No custom page "inbox"/],
    [["page", "set", "notes", "--first"], 2, /^--first goes with move, not set\./],
  ]) {
    const refused = await gallery(args);
    assert.equal(refused.code, code, args.join(" "));
    assert.match(refused.stderr, said, args.join(" "));
  }
  assert.deepEqual(await slugsOf(), ["board", "extra", "notes"], "a refusal moves nothing");

  // ===== card, with no server =====
  // Gallery's own blocks are put in the workspace (a page add of one not there says so), then a card of each on the page.
  for (const block of ["weather", "note"]) assert.equal((await gallery(["block", "add", block])).code, 0);
  for (const args of [["gallery/weather", "--set", "city=上海"], ["gallery/note"]]) {
    const added = await gallery(["page", "add", "board", ...args]);
    assert.equal(added.code, 0, added.stdout + added.stderr);
  }
  assert.deepEqual(cardsIn("board").map((card) => card["card-id"]), ["c1", "c2"]);
  const w1 = cardOf("board", "c1");
  assert.equal(cellsOf(w1), "0,0,4,2");
  const noteBefore = pageHtml("board").match(/<section[^>]*data-card-id="c2"[\s\S]*?<\/section>/)[0];
  done = await gallery(["page", "card", "board", "c1", "--set", "city=杭州", "--set", "unit=℉"]);
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /^The card c1 of board \(gallery\/weather\) on board main: x 0, y 0, w 4, h 2 \(the place as it was\)\.\n {2}Settings written: city="杭州" \(was "上海"\), unit="℉"\n$/);
  assert.ok(pageHtml("board").includes("杭州") && !pageHtml("board").includes("上海"), "the setting is written in the card");
  assert.equal(pageHtml("board").match(/<section[^>]*data-card-id="c2"[\s\S]*?<\/section>/)[0], noteBefore, "every other card byte for byte");
  // --move and --size in one write, the card it meets pushed down.
  done = await gallery(["page", "card", "board", "c2", "--move", "0,0", "--size", "4,2"]);
  assert.equal(done.code, 0, done.stderr);
  assert.equal(cellsOf(cardOf("board", "c2")), "0,0,4,2");
  assert.equal(cellsOf(cardOf("board", "c1")), "0,2,4,2", "the card it met is pushed down, none up");
  assert.match(done.stdout, /^The card c2 of board \(gallery\/note\) on board main: x 0, y 0, w 4, h 2 \(was x 4, y 0, w 4, h 2\)\.\n {2}Pushed down under it, as it met them: c1 \(y 2\); no card moved up\.\n$/);
  done = await gallery(["page", "card", "board", "c1", "--move", "8,1"]);
  assert.equal(cellsOf(cardOf("board", "c1")), "8,1,4,2");
  // A size the block does not give is the nearest it does, said.
  done = await gallery(["page", "card", "board", "c1", "--size", "4,3"]);
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /The block's sizes gave 4 × 2 for the 4 × 3 asked\./);
  // place, size and settings together: the place first, then the settings.
  done = await gallery(["page", "card", "board", "c1", "--move", "4,0", "--set", "city=北京"]);
  assert.equal(cellsOf(cardOf("board", "c1")), "4,0,4,2");
  assert.ok(pageHtml("board").includes("北京"));
  // The page service keeps page.html as it was before a write (the last 20), as add does.
  assert.ok(fs.readdirSync(path.join(workspace, ".gallery", "state", "pages", "board")).some((name) => name.endsWith(".html")));
  // Mistakes: nothing is written.
  const before = pageHtml("board");
  for (const [args, code, said] of [
    [["page", "card", "board"], 2, /^gallery page card takes a page's slug and a card's id/],
    [["page", "card", "board", "c1"], 2, /^Say what to do with the card/],
    [["page", "card", "board", "c1", "--remove", "--move", "1,1"], 2, /^--remove goes alone/],
    [["page", "card", "board", "c1", "--remove", "--set", "city=x"], 2, /^--remove goes alone/],
    [["page", "card", "board", "c1", "--move", "a,b"], 2, /^--move and --size take whole numbers/],
    [["page", "card", "board", "c1", "--move", "-1,0"], 2, /^--move and --size take whole numbers/],
    [["page", "card", "board", "c1", "--size", "0,2"], 2, /^--move and --size take whole numbers/],
    [["page", "card", "board", "c1", "--size", "4"], 2, /^--move and --size take whole numbers/],
    [["page", "card", "board", "c1", "--set", "nokey=1"], 2, /^gallery\/weather has no setting "nokey"/],
    [["page", "card", "board", "c1", "--set", "unit=kelvin"], 2, /^The setting unit of gallery\/weather is one of/],
    [["page", "card", "board", "c1", "--set"], 2, /^--set takes a setting's key and its value/],
    [["page", "card", "board", "nope", "--move", "0,0"], 1, /^No card "nope" on the page board: its cards are c1, c2/],
    [["page", "card", "nowhere", "c1", "--move", "0,0"], 1, /^No custom page "nowhere"/],
    [["page", "card", "board", "c1", "--board", "main"], 2, /^--board go with add, not card\./],
    [["page", "add", "board", "gallery/note", "--move", "1,1"], 2, /^--move goes with card, not add\./],
  ]) {
    const refused = await gallery(args);
    assert.equal(refused.code, code, `${args.join(" ")}\n${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, said, args.join(" "));
    if (code === 2 && args[1] === "card") assert.ok(refused.stderr.includes("Usage: gallery page card <slug> <card id>"), `${args.join(" ")}: card's usage lines`);
  }
  assert.equal(pageHtml("board"), before, "a mistake writes nothing");
  // A block that cannot be resized keeps its size (--move still works).
  fs.mkdirSync(path.join(workspace, "components", "local", "fixed"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "components", "local", "fixed", "component.json"), JSON.stringify({ id: "local/fixed", apiVersion: 1, version: "1.0.0", name: { zh: "定", en: "Fixed" }, description: { zh: "定", en: "Fixed" }, words: "fixed", places: ["page"], card: { w: 2, h: 2 }, parts: { title: { at: ":scope > h3", edit: "none" } } }));
  fs.writeFileSync(path.join(workspace, "components", "local", "fixed", "template.html"), '<div data-doc-component="local/fixed"><h3>Fixed</h3></div>\n');
  assert.equal((await gallery(["page", "add", "board", "local/fixed", "--x", "0", "--y", "6"])).code, 0);
  const fixedId = cardsIn("board").at(-1)["card-id"];
  const resized = await gallery(["page", "card", "board", fixedId, "--size", "6,4"]);
  assert.equal(resized.code, 1, resized.stdout + resized.stderr);
  assert.match(resized.stderr, /^Not changed: The card c3's block cannot be resized/);
  assert.equal((await gallery(["page", "card", "board", fixedId, "--move", "2,6"])).code, 0);
  assert.equal(cellsOf(cardOf("board", fixedId)), "2,6,2,2");
  // --remove: the card goes, its neighbours stay as they are.
  const c1 = pageHtml("board").match(/<section[^>]*data-card-id="c1"[\s\S]*?<\/section>/)[0];
  done = await gallery(["page", "card", "board", fixedId, "--remove"]);
  assert.equal(done.code, 0, done.stderr);
  assert.deepEqual(cardsIn("board").map((card) => card["card-id"]), ["c1", "c2"]);
  assert.equal(pageHtml("board").match(/<section[^>]*data-card-id="c1"[\s\S]*?<\/section>/)[0], c1, "the others byte for byte");
  assert.match(done.stdout, /^Removed the card c3 \(local\/fixed, board main: x 2, y 6, w 2, h 2\) from .*page\.html\.\nIts data went with it \(page\.html as it was is kept in \.gallery\/state\/pages\/board\/, the last 20 versions\); gallery page add board local\/fixed puts a new card of its block in\.\n$/);
  // A card with no id: the id the page gives it is the one to name (c1 for the first).
  fs.writeFileSync(path.join(workspace, "pages", "extra", "page.html"), pageHtml("extra").replace('<div class="gallery-board" data-board-id="main">', '<div class="gallery-board" data-board-id="main">\n      <section class="gallery-card" data-x="0" data-y="0" data-w="2" data-h="2">' + pageHtml("board").match(/<section[^>]*data-card-id="c2"[^>]*>([\s\S]*?)<\/section>/)[1] + "</section>"));
  done = await gallery(["page", "card", "extra", "c1", "--move", "6,0"]);
  assert.equal(done.code, 0, done.stdout + done.stderr);
  assert.equal(cellsOf(cardOf("extra", "c1")), "6,0,2,2", "a card with no id is named by the id the page gives it, which the write puts in the file");

  // ===== reset-cards =====
  const none = await gallery(["page", "reset-cards", "board"]);
  assert.deepEqual([none.code, none.stderr], [1, 'Nothing put back: The page board has no default cards: only a page whose page.json says "defaultCards": true (the default home page) has.\n']);
  fs.writeFileSync(path.join(workspace, "pages", "notes", "page.json"), `${JSON.stringify({ title: "我的 笔记", defaultCards: true }, null, 2)}\n`);
  done = await gallery(["page", "reset-cards", "notes"]);
  assert.equal(done.code, 0, done.stderr);
  const homeBlocks = ["gallery/today", "gallery/weather", "gallery/countdown", "gallery/habit", "gallery/stats", "gallery/todos", "gallery/heatmap", "gallery/recent", "gallery/note", "gallery/static"];
  assert.match(done.stdout, /^Put back 10 default cards on .*page\.html:\n/);
  assert.equal(cardsIn("notes").length, 10, "a card of each default block");
  for (const block of homeBlocks) assert.ok(done.stdout.includes(` of ${block}, board main: x `), `${block} put back`);
  assert.ok(!/重读/.test(done.stdout), done.stdout);
  assert.equal((await gallery(["page", "reset-cards", "notes"])).stdout, `The page notes holds a card of every default block already: nothing to put back.\n`);
  const gone = cardsIn("notes").find((card) => card.w === "2" && card.h === "2")["card-id"];
  assert.equal((await gallery(["page", "card", "notes", gone, "--remove"])).code, 0);
  const again = await gallery(["page", "reset-cards", "notes"]);
  assert.match(again.stdout, /^Put back 1 default card on /);
  assert.equal(cardsIn("notes").length, 10);
  // A default block turned off is said, not put back.
  const habit = cardsIn("notes").find((card) => blockOf("notes", card["card-id"]) === "gallery/habit")["card-id"];
  assert.equal((await gallery(["page", "card", "notes", habit, "--remove"])).code, 0);
  fs.writeFileSync(path.join(workspace, "gallery.json"), JSON.stringify({ ...settingsOf(), components: { ...settingsOf().components, disabled: ["gallery/habit"] } }, null, 2));
  const skipped = await gallery(["page", "reset-cards", "notes"]);
  assert.equal(skipped.code, 0, skipped.stderr);
  assert.match(skipped.stdout, /^No default card was put back on .*page\.html\.\n {2}Not put back: gallery\/habit \(turned off in 设置 › 组件列表\)\n$/, skipped.stdout);
  assert.equal((await gallery(["page", "reset-cards"])).code, 2);
  assert.equal((await gallery(["page", "reset-cards", "nowhere"])).code, 1);
  fs.writeFileSync(path.join(workspace, "gallery.json"), JSON.stringify({ ...settingsOf(), components: { ...settingsOf().components, disabled: [] } }, null, 2));

  // ===== gallery block: list --json =====
  fs.mkdirSync(path.join(workspace, "components", "local", "rates"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "components", "local", "rates", "component.json"), JSON.stringify({ id: "local/rates", apiVersion: 1, version: "0.1.0", name: { zh: "汇率", en: "Rates" }, description: { zh: "汇率", en: "Rates" }, words: "rates", places: ["page", "document"], needs: ["net:api.example.com", "net:*.cdn.example.com"], card: { sizes: [[4, 3]] }, parts: { title: { at: ":scope > h3", edit: "none" } } }));
  fs.writeFileSync(path.join(workspace, "components", "local", "rates", "template.html"), '<div data-doc-component="local/rates"><h3>Rates</h3></div>\n');
  const listed = json(await gallery(["block", "list", "--json"]));
  assert.deepEqual(Object.keys(listed), ["workspace", "blocks", "available", "builtin"]);
  assert.equal(listed.workspace, path.resolve(workspace));
  const rates = listed.blocks.find((block) => block.id === "local/rates");
  assert.deepEqual(rates, {
    id: "local/rates", pack: "local", name: { zh: "汇率", en: "Rates" }, description: { zh: "汇率", en: "Rates" }, version: "0.1.0", state: "normal", reason: null,
    places: ["page", "document"], needs: ["net:api.example.com", "net:*.cdn.example.com"], template: true, menu: true, unlisted: false, listedByDefault: true, disabled: false,
    net: { hosts: ["api.example.com", "*.cdn.example.com"], allowed: [], on: false },
  });
  assert.ok(listed.blocks.some((block) => block.id === "local/fixed" && block.places.join() === "page" && block.menu === false), "a block of pages alone is out of the document's menus by default");
  assert.ok(listed.available.length > 0 && listed.available.every((one) => one.id && one.add && one.title.zh && one.version && Array.isArray(one.places) && typeof one.added === "boolean"), "Gallery's own blocks not added (GALLERY_NO_PACKS: none are in the workspace)");
  assert.ok(listed.available.some((one) => one.id.startsWith("gallery/") && one.add === one.id.slice("gallery/".length)), "a bare name for Gallery 风格's, as gallery block add takes it");
  assert.ok(listed.available.some((one) => one.id.startsWith("gallery-soft/") && one.add === one.id), "an id for 柔光风格's");
  assert.ok(!listed.available.some((one) => one.id === "gallery/todos") && listed.blocks.some((block) => block.id === "gallery/todos"), "one that reset-cards put in is a block of the workspace, not one to add");
  assert.deepEqual(listed.builtin.find((one) => one.id === "callout"), { id: "callout", name: { zh: "提示块", en: "Callout" }, hidden: false, hideable: true });
  assert.equal(listed.builtin.find((one) => one.id === "paragraph").hideable, false);
  // The text list is as it was, and --json goes with list alone.
  assert.match((await gallery(["block", "list"])).stdout, /^工作区：/);
  assert.equal((await gallery(["block", "list", "x"])).code, 2);
  assert.match((await gallery(["block", "show", "local/rates", "--json"])).stderr, /^--json goes with list and pack list, not show\./);
  assert.match((await gallery(["block", "pack", "install", "x", "--json"])).stderr, /^--json goes with pack list, not pack install\./);

  // ===== menu, net =====
  done = await gallery(["block", "menu", "off", "rates"]);
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /^Took local\/rates out of the document's menus \("\/", 在下方新建, the handle's grid\): a document can still write it/);
  assert.deepEqual(settingsOf().components.hidden, ["local/rates"], "a block of documents is hidden (the dialog's 在文档菜单里显示)");
  assert.equal(json(await gallery(["block", "list", "--json"])).blocks.find((block) => block.id === "local/rates").menu, false);
  assert.equal((await gallery(["block", "menu", "off", "local/rates"])).stdout, "local/rates is out of the document's menus already: nothing changed.\n");
  assert.match((await gallery(["block", "menu", "on", "rates"])).stdout, /^Put local\/rates in the document's menus/);
  assert.deepEqual(settingsOf().components.hidden, []);
  // A block of pages alone is shown, not unhidden.
  assert.equal((await gallery(["block", "menu", "off", "fixed"])).stdout, "local/fixed is out of the document's menus already: nothing changed.\n");
  assert.equal((await gallery(["block", "menu", "on", "fixed"])).code, 0);
  assert.deepEqual(settingsOf().components.shown, ["local/fixed"]);
  assert.equal(json(await gallery(["block", "list", "--json"])).blocks.find((block) => block.id === "local/fixed").menu, true);
  assert.equal((await gallery(["block", "menu", "off", "fixed"])).code, 0);
  assert.deepEqual(settingsOf().components.shown ?? [], []);
  // A block its manifest keeps out of the menus (listed: false): a line of its own in list, and menu on turns its master switch on too.
  fs.mkdirSync(path.join(workspace, "components", "local", "quiet"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "components", "local", "quiet", "component.json"), JSON.stringify({ id: "local/quiet", apiVersion: 1, version: "0.1.0", name: { zh: "静", en: "Quiet" }, description: { zh: "静", en: "Quiet" }, parts: { title: { at: ":scope > h3", edit: "text" } }, listed: false }));
  fs.writeFileSync(path.join(workspace, "components", "local", "quiet", "template.html"), '<div data-doc-component="local/quiet"><h3>静</h3></div>\n');
  const hushed = json(await gallery(["block", "list", "--json"])).blocks.find((block) => block.id === "local/quiet");
  assert.deepEqual([hushed.unlisted, hushed.listedByDefault, hushed.menu, hushed.state], [true, false, true, "hidden"], "off by its manifest");
  const quietList = (await gallery(["block", "list"])).stdout;
  assert.ok(quietList.includes("Off by default (Gallery keeps them out of the menus until the user turns one on in 设置 › 组件列表;") && quietList.includes("local/quiet (静 / Quiet)") && !/^local\/quiet {2}/m.test(quietList), quietList);
  assert.match((await gallery(["block", "show", "local/quiet"])).stdout, /off by default: Gallery keeps it out of the menus until the user turns it on/);
  assert.match((await gallery(["block", "menu", "on", "quiet"])).stdout, /^Put local\/quiet in the document's menus/);
  assert.deepEqual([settingsOf().components.listed, json(await gallery(["block", "list", "--json"])).blocks.find((block) => block.id === "local/quiet").unlisted], [["local/quiet"], false], "its master switch on: in gallery.json's listed");
  assert.equal((await gallery(["block", "menu", "on", "quiet"])).stdout, "local/quiet is in the document's menus already: nothing changed.\n");
  fs.rmSync(path.join(workspace, "components", "local", "quiet"), { recursive: true });
  // A built-in block, by its id or its name; one that stays in the menus.
  assert.match((await gallery(["block", "menu", "off", "callout"])).stdout, /^Took the built-in block callout \(提示块 \/ Callout\) out of the document's menus/);
  assert.deepEqual(settingsOf().components.hidden, ["callout"]);
  assert.equal(json(await gallery(["block", "list", "--json"])).builtin.find((one) => one.id === "callout").hidden, true);
  assert.equal((await gallery(["block", "menu", "off", "Callout"])).stdout, "The built-in block callout (提示块 / Callout) is out of the document's menus already: nothing changed.\n", "its name, in either language");
  assert.match((await gallery(["block", "menu", "on", "提示块"])).stdout, /^Put the built-in block callout/);
  assert.deepEqual(settingsOf().components.hidden, []);
  const stays = await gallery(["block", "menu", "off", "paragraph"]);
  assert.deepEqual([stays.code, stays.stderr], [1, "The built-in block paragraph (文本 / Text) stays in the document's menus: it cannot be taken out.\n"]);
  assert.match((await gallery(["block", "menu", "on", "paragraph"])).stdout, /always in the document's menus/);
  for (const [args, code, said] of [
    [["block", "menu"], 2, /^gallery block menu takes on or off and one block/],
    [["block", "menu", "on"], 2, /^gallery block menu takes on or off and one block/],
    [["block", "menu", "yes", "rates"], 2, /^gallery block menu takes on or off and one block/],
    [["block", "menu", "off", "a", "b"], 2, /^gallery block menu takes on or off and one block/],
    [["block", "menu", "off", "Bad Name"], 2, /^Not a block's id: Bad Name .* A built-in block of the menus is named by its id or its name: paragraph, heading,/],
    [["block", "menu", "off", "nothing"], 1, /^No block local\/nothing in /],
    [["block", "net", "on"], 2, /^gallery block net takes on or off and one block/],
  ]) {
    const refused = await gallery(args);
    assert.equal(refused.code, code, `${args.join(" ")}\n${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, said, args.join(" "));
    if (code === 2) assert.ok(refused.stderr.includes(`Usage: gallery block ${args[1]} on|off <block>   (gallery block --help says more)`), `${args.join(" ")}: the usage line of ${args[1]}`);
  }
  // net on: the websites first, then the consent in gallery.json; net off takes it back.
  done = await gallery(["block", "net", "on", "rates"]);
  assert.equal(done.code, 0, done.stderr);
  const asked = done.stdout.split("\n");
  assert.equal(asked[0], "local/rates will reach these websites: api.example.com, *.cdn.example.com", "what it reaches, printed first");
  assert.match(asked[2], /^提示：turn this on only when the user asked for it; gallery block net off local\/rates takes it back\.$/);
  assert.match(asked[3], /^Allowed local\/rates to reach api\.example\.com, \*\.cdn\.example\.com /);
  assert.deepEqual(settingsOf().components.net, { "local/rates": ["api.example.com", "*.cdn.example.com"] }, "gallery.json's components.net, as the consent dialog writes it");
  assert.deepEqual(json(await gallery(["block", "list", "--json"])).blocks.find((block) => block.id === "local/rates").net, { hosts: ["api.example.com", "*.cdn.example.com"], allowed: ["api.example.com", "*.cdn.example.com"], on: true });
  assert.match((await gallery(["block", "net", "on", "rates"])).stdout, /local\/rates is allowed to reach them already: nothing changed\.\n$/);
  done = await gallery(["block", "net", "off", "local/rates"]);
  assert.match(done.stdout, /^Took back local\/rates's reach to api\.example\.com, \*\.cdn\.example\.com /);
  assert.equal(settingsOf().components.net, undefined, "taken back");
  assert.equal((await gallery(["block", "net", "off", "rates"])).stdout, "local/rates is not allowed to reach any website: nothing to take back.\n");
  const quiet = await gallery(["block", "net", "on", "fixed"]);
  assert.deepEqual([quiet.code, quiet.stdout], [1, ""]);
  assert.match(quiet.stderr, /^local\/fixed reaches no website: its manifest's needs name no net:<host>/);
  assert.equal((await gallery(["block", "net", "on", "nothing"])).code, 1);

  // ===== packs: list --json, on, off =====
  // The test's workspace has no pack installed (GALLERY_NO_PACKS): the default pack, and the scope gallery that its blocks added one by one made.
  const bare = json(await gallery(["block", "pack", "list", "--json"]));
  assert.deepEqual(Object.keys(bare), ["workspace", "packs"]);
  assert.deepEqual(bare.packs.map((pack) => [pack.id, pack.kind, pack.enabled]), [["local", "default", true], ["gallery", "official", true]]);
  assert.deepEqual(Object.keys(bare.packs[0]), ["id", "name", "description", "version", "author", "homepage", "icon", "kind", "problem", "blocks", "enabled", "changed", "newer"]);
  const refusedPack = await gallery(["block", "pack", "on", "gallery-soft"]);
  assert.deepEqual([refusedPack.code, refusedPack.stderr], [1, "No pack gallery-soft in this workspace (local, gallery): gallery block pack list says which there are.\n"], "under GALLERY_NO_PACKS none of Gallery's own is installed first");
  // Without that: one of Gallery's own the workspace has not got is installed first, then switched (as a server's start installs them).
  const withPacks = { GALLERY_NO_PACKS: "" };
  done = await gallery(["block", "pack", "on", "gallery-soft"], withPacks);
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /^Installed Gallery's own packs first, as gallery init and a server's start do \(gallery, gallery-soft\)\.\nSwitched the pack gallery-soft \(柔光风格 \/ Soft style\) on: its blocks are offered by "\/" and 添加自定义块 /);
  const packs = json(await gallery(["block", "pack", "list", "--json"]));
  assert.deepEqual(packs.packs.map((pack) => [pack.id, pack.enabled]), [["local", true], ["gallery", true], ["gallery-soft", true]]);
  assert.deepEqual(packs.packs.find((pack) => pack.id === "gallery-soft").name, { zh: "柔光风格", en: "Soft style" });
  assert.equal(settingsOf().components.packs["gallery-soft"].enabled, true);
  assert.equal((await gallery(["block", "pack", "on", "gallery-soft"], withPacks)).stdout, "The pack gallery-soft (柔光风格 / Soft style) is on already: nothing changed.\n");
  done = await gallery(["block", "pack", "off", "gallery-soft"]);
  assert.match(done.stdout, /^Switched the pack gallery-soft \(柔光风格 \/ Soft style\) off: no menu or library offers its blocks, and what is written of them shows as ever/);
  assert.equal(json(await gallery(["block", "pack", "list", "--json"])).packs.find((pack) => pack.id === "gallery-soft").enabled, false);
  assert.equal(settingsOf().components.packs["gallery-soft"].enabled, false);
  assert.equal((await gallery(["block", "pack", "off", "gallery-soft"])).stdout, "The pack gallery-soft (柔光风格 / Soft style) is off already: nothing changed.\n");
  const localPack = json(await gallery(["block", "pack", "list", "--json"])).packs[0];
  assert.equal((await gallery(["block", "pack", "on", "local"])).stdout, `The pack local (${localPack.name.zh} / ${localPack.name.en}) is on already: nothing changed.\n`);
  assert.equal((await gallery(["block", "pack", "off", "local"])).code, 0, "the default pack has a switch as any");
  assert.equal((await gallery(["block", "pack", "on", "local"])).code, 0);
  for (const [args, code, said] of [
    [["block", "pack", "on"], 2, /^gallery block pack on takes one pack's id/],
    [["block", "pack", "off", "a", "b"], 2, /^gallery block pack off takes one pack's id/],
    [["block", "pack", "on", "Bad_Id"], 2, /^Not a pack's id: Bad_Id/],
    [["block", "pack", "on", "nope"], 1, /^No pack nope in this workspace \(local, gallery, gallery-soft\)/],
    [["block", "pack", "enable", "gallery-soft"], 2, /^No such pack command: enable \(install, list, remove, on, off\)\./],
    [["block", "pack"], 2, /^Say what to do with packs: install <folder\|zip>, list, remove <pack>, on <pack>, off <pack>\./],
  ]) {
    const refused = await gallery(args, withPacks);
    assert.equal(refused.code, code, `${args.join(" ")}\n${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, said, args.join(" "));
    if (code === 2) assert.ok(refused.stderr.includes("gallery block pack on|off <pack>   (gallery block --help says more)"), `${args.join(" ")}: pack's lines of the usage`);
  }

  // ===== the same through the workspace's running server =====
  // Its queue: an open page shows each change at once. A server of its own, on a port of the range, stopped in the end.
  serverPort = await freePort();
  const opened = await gallery(["open", "--no-browser"]);
  assert.equal(opened.code, 0, opened.stdout + opened.stderr);
  const listedNow = json(await gallery(["page", "list", "--json"]));
  assert.deepEqual([listedNow.server, listedNow.pages[0].address], [{ port: serverPort }, `http://127.0.0.1:${serverPort}/#@board`], "with a server running: its port, and the whole address");
  done = await gallery(["page", "card", "board", "c1", "--move", "0,4", "--set", "city=广州"]);
  assert.equal(done.code, 0, done.stdout + done.stderr);
  assert.match(done.stdout, /^The card c1 of board \(gallery\/weather\) on board main: x 0, y 4, w 4, h 2 \(was x 4, y 0, w 4, h 2\) \(through the workspace's running server: an open page shows it at once\)\.\n {2}Settings written: city="广州" \(was "北京"\)/);
  assert.equal(cellsOf(cardOf("board", "c1")), "0,4,4,2");
  assert.ok(pageHtml("board").includes("广州"));
  done = await gallery(["page", "card", "board", "c2", "--remove"]);
  assert.match(done.stdout, /^Removed the card c2 \(gallery\/note, board main: x 0, y 0, w 4, h 2\) from .*page\.html \(through the workspace's running server: an open page shows it at once\)\./);
  assert.deepEqual(cardsIn("board").map((card) => card["card-id"]), ["c1"]);
  const stale = await gallery(["page", "card", "board", "c2", "--move", "0,0"]);
  assert.deepEqual([stale.code, stale.stderr.split("\n")[0]], [1, 'No card "c2" on the page board: its cards are c1 (gallery page check lists them).']);
  // (the habit card was taken off above and its block turned on again since)
  assert.match((await gallery(["page", "reset-cards", "notes"])).stdout, /^Put back 1 default card on .*notes[\\/]page\.html \(through the workspace's running server: an open page shows them at once\):\n {2}data-card-id="c\d+" of gallery\/habit, /);
  assert.match((await gallery(["page", "reset-cards", "notes"])).stdout, /^The page notes holds a card of every default block already/);
  fs.writeFileSync(path.join(workspace, "pages", "extra", "page.json"), `${JSON.stringify({ title: "额外", defaultCards: true })}\n`);
  done = await gallery(["page", "reset-cards", "extra"]);
  assert.match(done.stdout, /^Put back (9|10) default cards on .*page\.html \(through the workspace's running server: an open page shows them at once\):\n/, done.stdout);
  done = await gallery(["page", "move", "notes", "--first"]);
  assert.equal(done.code, 0, done.stderr);
  assert.deepEqual(await slugsOf(), ["notes", "board", "extra"], "the head written through the server");
  assert.equal((await gallery(["page", "set", "board", "--title", "工作台"])).code, 0);
  assert.equal(json(await gallery(["page", "list", "--json"])).pages.find((page) => page.slug === "board").title, "工作台");
  // The switches through the server: gallery.json written by its component settings.
  assert.match((await gallery(["block", "pack", "on", "gallery-soft"])).stdout, /^Switched the pack gallery-soft/);
  assert.equal(settingsOf().components.packs["gallery-soft"].enabled, true);
  assert.match((await gallery(["block", "menu", "off", "rates"])).stdout, /^Took local\/rates out of the document's menus/);
  assert.deepEqual(settingsOf().components.hidden, ["local/rates"]);
  assert.match((await gallery(["block", "net", "on", "rates"])).stdout, /Allowed local\/rates to reach api\.example\.com/);
  assert.deepEqual(settingsOf().components.net, { "local/rates": ["api.example.com", "*.cdn.example.com"] });
  assert.match((await gallery(["block", "net", "off", "rates"])).stdout, /^Took back local\/rates's reach/);
  assert.equal(json(await gallery(["block", "list", "--json"])).blocks.find((block) => block.id === "local/rates").net.on, false);
  const stopped = await gallery(["stop"]);
  assert.equal(stopped.code, 0, stopped.stdout + stopped.stderr);
  serverPort = null;
} finally {
  if (serverPort) await gallery(["stop"]).catch(() => {});
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked gallery page and block for an Agent the user asks: the usage of block and page kept by subcommand (gallery help block / page a line for each subcommand, gallery help block pack and gallery block pack --help that one in full, an unknown subcommand a mistake that lists them, every option still said by the subcommand that takes it and every line of the old usage still there, a command with no sections printed whole, the synopses a mistake is said with); page list (--json one object, a page in the trash not listed), set (the title and the icon in page.json, the rest as it was, page.html untouched, a title or icon refused), move (--after, --first, the head in the outline file, there already, refused), card (--set held to the block's types, --move, --size, --remove, several at once, the cards it meets pushed down, a size the block gives the nearest, a card that cannot be resized, a card with no id, every mistake writing nothing) and reset-cards (the default cards put back, those turned off said), with no server and through a running one; block list --json, pack list --json, pack on and off (one of Gallery's own installed first), menu on and off (a custom block, a block of pages alone, a built-in block, one that stays) and net on and off (the websites printed first, a block that reaches none refused), each as the component list's switches write gallery.json.");
