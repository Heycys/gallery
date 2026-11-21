// The usage of the commands that have subcommands, kept by subcommand (gallery block, gallery page):
// `gallery help <command>` (and `gallery <command> --help`) says what the command is and one line for
// each subcommand; `gallery help <command> <subcommand>` (and `gallery <command> <subcommand> --help`)
// says that one in full, its usage lines, what it does and prints and its exit codes. A text of 15,000
// characters (gallery block) made an Agent that looked up one option read all of it
// (2026-11-11). USAGE.block and USAGE.page (./usage.mjs) stay the whole
// text, every subcommand's put together (wholeUsage): what a mistake in a command line takes its first
// line from, and what the documents' commands are checked against (tests/unit/skill-docs.mjs). Nothing
// here imports anything: help reads nothing but ./usage.mjs.
//
// A command's sections: { command, intro (what the command is: the part every subcommand shares),
// subs: [{ name, summary (one line), usage (its lines, without "Usage:"), text (what it does, prints
// and exits with) }] }. A command with no sections (every other command) is printed whole.

const usageLines = (lines) => lines.map((line, index) => (index === 0 ? `Usage: ${line}` : `       ${line}`)).join("\n");

/** The whole usage of a command with sections: its usage lines (each subcommand's), its intro and every subcommand's text. */
export const wholeUsage = ({ intro, subs }) => [usageLines(subs.flatMap((sub) => sub.usage)), intro, ...subs.map((sub) => sub.text)].join("\n");

/** What `gallery help <command>` prints: the command's intro, then a line for each subcommand and how to see one in full. */
export function overviewUsage({ command, intro, subs }) {
  const width = Math.max(...subs.map((sub) => sub.name.length));
  return [
    `Usage: gallery ${command} <command> [options]`,
    intro,
    "",
    `Commands (gallery help ${command} <command> prints one in full: its usage lines, what it does and prints, its exit codes):`,
    ...subs.map((sub) => `  ${sub.name.padEnd(width)}  ${sub.summary}`),
  ].join("\n");
}

/** What `gallery help <command> <sub>` prints: that subcommand's usage lines and its text, and where the rest is. */
export const subUsage = ({ command }, sub) => `${usageLines(sub.usage)}\n${sub.text}\ngallery help ${command} says what a ${command} is and lists the other commands.`;

export const BLOCK_SECTIONS = {
  command: "block",
  intro: `A custom block (自定义块) is a block to use again, kept in the workspace: components/<scope>/<name>/
(its files keep the word component: component.json, data-doc-component). An id is <scope>/<name>, or a
<name> alone in the scope local (but for show and check, a <name> that is none of local's and is one of
Gallery's own is Gallery's, as for add: gallery block show heatmap shows gallery/heatmap); a document
uses one by an element naming it. The scopes gallery and gallery-soft are Gallery's own blocks' (its page cards' two looks,
the packs Gallery 风格 and 柔光风格; its blocks for documents count in the default pack). gallery component … is another name for gallery block …, and says the same.`,
  subs: [
    {
      name: "new",
      summary: "start a block (--script --flow --data --page, or --recipe <name> from one of Gallery's own)",
      usage: ["gallery block new <id> ([--script] [--flow] [--data] [--page] | --recipe <name>)"],
      text: `new starts a block: component.json, template.html, example.html, writing.md and style.css, and with
--script a kit.js; with --flow a slot, body, in place of its paragraph, where a document writes blocks
of its own; with --data a block that keeps what a reader enters in a part of JSON (items, a list of
lines, written on one line as context.editJSON writes it): a kit.js that reads it with context.readJSON
and writes it with context.editJSON, from a field (DocKit.input) and a button hidden where nothing is
written (an export), an example() that adds a line and works on template.html's empty instance as it
does on example.html's (--script is implied; --data and --flow do not go together); with --page a
custom page's card (places ["page"], a card of two sizes the user may resize, its text parts edited as
none, which a page shows as written; --page and --flow do not go together), combined with --data a
card that keeps data; with --recipe <name> (alone: none of --script --flow --data --page goes with it, the
recipe being a block already made: todos, weather and the other blocks of Gallery's for a custom page
are cards for one already, places ["page"]) the files of Gallery's own block of that name, every word
that named it naming the new id, its version 0.1.0 (not its pictures), and a line naming what is
still the recipe's: writing.md and example.html. Each passes check, and try on its field, as it stands, and
says what to write next.
Exits 1 when the id is taken; 2 for an id of the scope of Gallery's own packs or of a pack installed, a
recipe Gallery has none of, or options that do not go together.`,
    },
    {
      name: "add",
      summary: "put one of Gallery's own blocks into the workspace as it ships",
      usage: ["gallery block add <name>"],
      text: `add puts one of Gallery's own blocks in the workspace as it ships (a <name> alone is Gallery 风格's,
gallery-soft/<name> 柔光风格's), components/gallery/<name>/, no check
or try needed, and records its version and what its files hold in .gallery/blocks.json; run again with a
newer Gallery, it updates a copy that is as it was added, and never one changed since.
Exits 1 when the copy there was changed since it was added (or put there by another hand), said with
what to do: --recipe for a block of your own, or delete the folder and add it again.`,
    },
    {
      name: "list",
      summary: "what the workspace has now, by where a block may stand (--json for a script)",
      usage: ["gallery block list [--json]"],
      text: `list says what the workspace has now, in two groups by where a block may stand (its manifest's places):
文档里可用, in documents, and 自定义页可用, on custom pages, each with its version, what it uses (needs)
and whether the user's switch keeps it out of the document's menus, which is still a block to write;
then, in one line, those Gallery keeps out of the menus until the user turns one on (a manifest's
listed: false; a document that has one still shows it); then those not to use now and why: disabled,
one that does not load, a manifest one level too shallow;
then Gallery's own blocks not added yet, or added as an older version, each with its gallery block add
line; and last the built-in blocks the user took out of the document's menus.
--json prints one JSON object instead, 2-space indented, and nothing else: { "workspace": its absolute
path, "blocks": [every block of the workspace, those that do not run too: { "id", "pack" (the pack it
counts in: its scope, local for Gallery's own blocks for documents), "name" and "description"
({ "zh", "en" }; null where its manifest does not read), "version", "state"
("normal", "hidden", "disabled" or "broken"), "reason" ({ "zh", "en" }: why a broken one does not load,
else null), "places" (["document"], ["page"] or both; null where unread), "needs" (its manifest's; null
where unread), "template" (whether a menu can put it in), "menu" (the switch 在文档菜单里显示), "unlisted"
(the master switch off: no menu or library offers it), "listedByDefault" (false: its manifest's listed,
off until the user turns it on), "disabled" (停用), "net": { "hosts" (the websites
its needs name), "allowed" (those the user allowed), "on" (允许联网 is on: every host allowed) } }],
"available": [Gallery's own blocks the workspace has not added, or has as an older version: { "id",
"add" (what gallery block add takes), "title" ({ "zh", "en" }), "version", "places", "added", "workspaceVersion",
"changed" }], "builtin": [the built-in blocks of the document's menus, what gallery block menu takes
besides a custom block's id: { "id", "name" ({ "zh", "en" }), "hidden", "hideable" }] }. The fields
are only ever added.`,
    },
    {
      name: "show",
      summary: "how to write one block: its parts, where it may stand, writing.md and the example",
      usage: ["gallery block show <id>"],
      text: `show says how to write one: its parts, where it may stand, its writing.md and its example. Of one of
Gallery's own the workspace has not added (gallery/<name>) it prints what Gallery ships of it the same
way, and ends with the gallery block add <name> line that puts it in.
Exits 1 when there is no such block or it does not load.`,
    },
    {
      name: "check",
      summary: "what is wrong with a block, in its files and in a browser (--documents: its instances too)",
      usage: ["gallery block check <id> [--documents]"],
      text: `check says what is wrong with one, each problem ("FAIL") at its place in the block's files, each note
never a failure, in five sections: 1 the manifest, with template.html there, text parts that hold
words and marks alone, and a note on a Chinese name no word of its words spells whole in pinyin, a
syllable a character, by how many syllables a word reads as; 2 kit.js: what a browser refuses, what
an export refuses, what it registers, a type check against sdk/; 3 style.css: every selector in the
instance, what an export cannot hold, and a note on one that goes down into a slot; 4 template.html
and example.html, each read as a document's page by what gallery check runs, and template.html as what
a menu can put in; 5
both in a temporary document, exported and opened as gallery qa opens one, in Chrome or Edge under the export's
policy: what the console and the policy say, a dialog or a window it opens, mount then dehydrate then
mount and copies put back giving the same DOM (a drawing neither the manifest's runtime nor dehydrate
names piles up, and what piles up outside the instance is named too), a slot the component writes in
or moves, a text part the component redraws, a data part a mount changes, a write with no gesture
once the page takes edits, the way back to the file (a way back line: what the component's example wrote, each part with how many of its
lines the write took out and put in, and that the server took it; a note on a write that lays a part
out anew (not where it is context.editJSON's own layout: a part on several lines closing to one line as
its list empties, an entry in it opening to lines as it comes to hold an object; a part on one line
stays on one), a FAIL at kit.js on an example() that changes nothing on template.html's empty instance, and a
note on a list a card is dropped on that listens for dragover and not for dragenter), a note on a
control of an instance with a data part that is still shown and enabled where nothing is written (the
export's look: context.canEdit() false), a page wider than the window, and the pictures, in <workspace>/.gallery/qa/components/<id>/, its absolute
path printed, emptied each run: overview-light.png and overview-dark.png, the three widths of a theme
side by side, then each at 360, 736 and 1024px wide, light and dark, and edit-1024-light.png and
edit-360-light.png, as the editing page draws it, said when they are the export's. Section 5 waits
until what it needs passes; a page that stops answering or loads itself again ends it, and is said;
with no browser, one that does not start or goes while it looks, or a folder it cannot write, it says
so and the rest stands. A block the user turned off is checked as any, with a note saying so. Last,
before the verdict, a 提示 line says where the pictures are (the two overviews the whole of it): none
needs opening, any may be. A check that passes also writes, unsaid, the menus' pictures of the block
into its folder (preview-light.webp, preview-dark.webp: its example, light and dark), not of Gallery's
own nor of a pack's; nothing to look at.
--documents adds a section for each document of the workspace that holds instances of it, those in
another's slot too: each run as the example is, in a temporary document of their own, exported and
opened under the export's policy, each problem at its line of the document's file (board/doc.html:15),
the pictures in documents/<slug>/ of the block's folder. It writes no document.
GALLERY_BROWSER=<executable> picks the browser.
Exits 1 when anything fails, 3 when nothing did and no browser ran it (UNVERIFIED), else 0.
Exits 2 for an id no block can have.`,
    },
    {
      name: "try",
      summary: "make a reader's gestures on an instance in a document, and say what they wrote",
      usage: ["gallery block try <slug> [<instance id>] --press <selector> [--then <key>] [--keep]", "gallery block try <slug> [<instance id>] --drag <selector> --to <selector> [--then <key>] [--keep]", "gallery block try <slug> [<instance id>] --key <selector> <key> [--then <key>] [--keep]", "gallery block try <slug> [<instance id>] --type <selector> <words> [--replace] [--then <key>] [--keep]", "gallery block try <slug> [<instance id>] --select <selector> <value> [--then <key>] [--keep]", "gallery block try <slug> [<instance id>] --steps <file> [--keep]"],
      text: `try makes what a reader does on an instance in a document, with the pointer and the keys, and says
what it wrote. It makes it on a scratch copy of the document (<workspace>/.gallery/try/try-<8 hex>/,
gone at the end, whatever came of it): doc.html is not written, and no page of the user's shows the trial;
--keep makes it on the document itself and leaves what it wrote. It starts the shared Gallery server (or
uses the one running), as gallery open does, and opens the copy's page alone, editable, in Chrome or
Edge, headless, in a profile of its own, and waits until the server has told the page of the writes
made before it (a custom block changed), which load it again. Each selector is the first element of the
instance it finds: --press, a press at its middle; --drag … --to, pressed there, moved in steps to the
middle of another and released a moment after the move that comes onto it; --key, the key (Enter,
Space, ArrowRight, a letter, Shift+Tab, Control+a) with the focus on it, as Tab gives it; --type, the
words typed in a field or an editable element, pressed first and the caret at its end (unless the focus
is in it already), ASCII key by key and the rest through an input method, composed then committed (the
Gesture line says what the field held, and that the words went after it, or, with the focus in it
already, in at the caret where a step before left it; --replace selects all it holds first, so that
they take its place, as { "type": [".name", "新名字"], "replace": true } in a step);
--select, an option of a <select>, by its value or its words, chosen as a reader picks one. --then
<key> presses a key after it where the focus is (--then Enter, for a field that writes on Enter).
--steps <file> makes several, one after another in one page: a JSON list of steps, each one gesture as
the options name them, without their --: [{ "press": ".add" }, { "key": [".name", "Control+a"] },
{ "type": [".name", "多喝水"], "then": "Enter" }, { "select": [".unit", "杯"] }, { "drag": ".card",
"to": ".column:nth-child(3)" }], 20 at most. <slug> names the document, as its link or a whole address
does too (gallery help says how), and the instance is named by its data-block-id, or by its block's
id where the document holds one of it; with one instance in the document, not at all. An instance in
another's slot is one of them, said with where it stands. Once <html>'s data-ge-save says saved again
after each, it prints a Gesture line (Step N with --steps), what it did to which element, and a Wrote
line: each part of the instance with how many of its lines it took out and put in, then those lines
(- and +), and that nothing outside the instance changed, data-block-id aside, which a save gives
(what did is someone else's, which stays); with --steps, Wrote: nothing of a step that wrote nothing.
Then it undoes as a reader does, the focus taken off a field of the instance first (a field that
writes as it loses the focus writes then), and Ctrl+Z pressed once for each write the page took, the
last first (each context.edit is an undo step of its own: a step that wrote twice takes two), and an
Undone line says the copy came back as it was before each step that wrote; --keep presses none (a Kept
line). Then it opens what the steps wrote in a fresh page (a second copy, or doc.html with --keep),
where the instance is to mount, write nothing as it opens (its file the same once it has come to edit)
and show the words and the fields' values it showed after them of what they wrote (a Read back line);
what it shows otherwise that is none of what the steps wrote (a filter or a tab chosen, an editor left
open, words typed and not committed: what the page showed and never wrote) is a note. Last, a picture of
the instance after the steps, <workspace>/.gallery/qa/<slug>/try/after.png, its absolute path
printed, emptied each run: open it when you want to see it (the lines above it say what the gesture
did); a 提示 line then counts the pictures of the run (after.png, and fresh.png when it was taken). A trial cut off (the page offline, a load of its
own, the browser gone) says what the file held of it.
Exits 1 when no step wrote anything (what came of the last said: no context.edit, one the page
refused, an HTML5 drag dropped nowhere, a selector that finds nothing as the component failed, a
field typed in that writes on a key or as it loses the focus), when a Ctrl+Z did not take a step's
write back, when the fresh page shows it in its fallback, writes as it opens or shows what the steps
wrote otherwise than the page did after them (fresh.png pictures it), or when the component failed; 2
for a mistake in the command line: a selector that finds nothing shown in the instance, an instance the
document has not among them, a drag that ends on what it drags, an option a <select> has not, a steps
file that does not read (one found at a step after others were made is said after what those wrote,
which with --keep stays in doc.html); 3 when the trial was not seen through (UNVERIFIED: no server or browser ran
it, a page that loaded itself again; with --keep a card waiting for the reader, someone else's write
meanwhile, which stays), the line saying what the file held.`,
    },
    {
      name: "key",
      summary: "keep, show or take away the key for a site a block reaches",
      usage: ["gallery block key [<host> [<key>]] [--remove]"],
      text: `key keeps the workspace's key for a site its blocks reach, by its host (a block's needs' host:
api.example.com), in <workspace>/.gallery/keys.json, never gallery.json: where a block's address on that
host names {key} (its path or its query: …/latest?apikey={key}), Gallery's server writes the key in as it
fetches for the block (context.fetch); no page, cache or export ever holds it. With a host and no key
it says whether one is kept; with --remove it takes it away; with nothing, the hosts that have one and
those the workspace's blocks name with none. A key is never printed.
Exits 2 for a host no block's needs can name, or a key that is empty or more than one line.`,
    },
    {
      name: "pack",
      summary: "block packs (自定义块包): install, list, remove, switch on or off",
      usage: ["gallery block pack install <folder|zip>", "gallery block pack list [--json]", "gallery block pack remove <pack>", "gallery block pack on|off <pack>"],
      text: `pack: a block pack (自定义块包) is a scope of blocks, components/<pack>/, with its pack.json (id, name,
description, version, author, homepage, icon), to share as its folder or a zip of it. pack install copies
one in (a folder, or a zip with the pack's folder or what it holds at its top), each block's manifest
last, and records its version and what its files hold in .gallery/blocks.json; installed again (a newer
version), a block as it was installed is replaced and one changed since is kept, said with what to do.
Refused, exit 1, with why: no pack.json at its top or one that does not read, a block folder whose
component.json does not name it <pack>/<name>, a file that points out of it, more than 2000 files or 64
MB, the id of one of Gallery's own packs, or one the workspace has a folder of that no install put
there. pack list says the workspace's packs: Gallery's own (installed as a workspace first starts:
Gallery 风格 on, 柔光风格 off), those installed and the scopes of its own blocks, each with its version,
whether its switch in 设置 › 组件列表 is on (off: no menu or library offers its blocks; what is written of
them shows as ever), how many blocks and who made it. pack remove takes out a pack installed, its
folder and records (exit 1 for one of Gallery's own, which its switch turns off, or a scope no install
put there).
pack list --json prints one JSON object instead, 2-space indented, and nothing else: { "workspace": its
absolute path, "packs": [{ "id", "name" ({ "zh", "en" }), "kind" ("default", "official", "installed" or
"own"), "version", "enabled" (its switch), "blocks" (how many), "author", "description", "homepage",
"icon", "problem" ({ "zh", "en" }: why its pack.json does not read, else null), "changed" (the blocks
changed since they were installed), "newer" }] } in the order pack list says them; the fields are only
ever added.
pack on and pack off turn a pack's switch on or off, the switch of its card in 设置 › 组件列表
(gallery.json's components.packs): off, no menu or library offers its blocks ("/" and 添加自定义块),
and what is written of them shows as ever; on offers them again. <pack> is its id (gallery block pack
list says each: gallery for Gallery 风格, gallery-soft for 柔光风格, local for the default pack, Gallery's
own blocks for documents among its blocks). One of
Gallery's own the workspace has not got yet (no server has started in it, gallery init has not run) is
installed first, as they install it; the user turns the packs on and off, so do it when they ask. It is
written through the workspace's running server when there is one (the open pages follow at once), else
here, and says whether it changed anything (a pack on already is not an error).
Exits 1 when the workspace has no such pack (or gallery.json cannot be read or written); 2 for a pack id
that is none.`,
    },
    {
      name: "menu",
      summary: "show a block in the document's menus or take it out (设置 › 组件列表 › 在文档菜单里显示)",
      usage: ["gallery block menu on|off <block>"],
      text: `menu on and menu off turn the block's switch 在文档菜单里显示 of 设置 › 组件列表 on or off: off, "/", 在下方新建
and the handle's grid no longer offer it, and what is written of it in documents still runs and exports as
ever (the switch is about the menus alone, a document still writes the block); on offers it again. <block>
is a custom block's id (a <name> alone is local's, else Gallery's own: as show takes it) or the name of a
built-in block (callout, quote, table…: gallery block list --json lists them as "builtin", with the ones that
cannot be taken out). A block that stands on custom pages alone (its places hold page, not document) is out
of the document's menus until menu on. menu on turns the row's master switch (在所有菜单里提供) on too where
it is off: one the user turned off, or one Gallery keeps out of the menus until the user wants it (its
manifest's listed: false). A built-in block that must stay in the menus (text, headings,
lists…) is refused. It is written through the workspace's running server when there is one (the open pages
follow at once), else here, and says whether it changed anything.
Exits 1 when there is no such block or the block cannot be hidden (or gallery.json cannot be read or
written); 2 for a block id that is none, or a missing on or off.`,
    },
    {
      name: "net",
      summary: "let a block reach the websites its needs name, or take that back (only when the user asks)",
      usage: ["gallery block net on|off <block>"],
      text: `net on lets a custom block reach the websites its manifest's needs name (net:<host>), the switch 允许联网 of
设置 › 组件列表: Gallery fetches for the block, only from those sites, with none of the user's logins, and
what it gets is shown in Gallery and kept in an export. It goes beyond the workspace, so turn it on only
when the user asked for it, never to make a block work on your own say. net on prints the websites first
(all of them are allowed together; one that a later version of the block adds needs a new net on), then
writes the consent in gallery.json (components.net). net off takes it back at once (the block shows what
it last had, or asks the reader again). It is written through the workspace's running server when there is
one (the open pages follow at once), else here, and says whether it changed anything.
Exits 1 when there is no such block, its needs name no website, or gallery.json cannot be read or written;
2 for a block id that is none, or a missing on or off.`,
    },
  ],
};

export const PAGE_SECTIONS = {
  command: "page",
  intro: `A custom page (自定义页) is a page the workbench lists in its sidebar with 新建 and 搜索, kept in the
workspace: pages/<slug>/, page.html (free HTML: its look, its own scripts, and boards of cards, each card
one custom block's instance, where it has them) and page.json ({ "title", "icon" }). An Agent writes them
(the user may make a blank one for an Agent to write); the user orders, renames and trashes them, and an
Agent does so when the user asks (page set, page move, gallery trash <slug>), not on its own.
Documents and custom pages share one set of slugs: neither takes the other's, nor pages (the folder).
The home page (首页) is pages/home, a page as any.`,
  subs: [
    {
      name: "new",
      summary: "make a page: page.html with one empty board, and page.json",
      usage: ["gallery page new <slug> \"<title>\""],
      text: `new makes one: page.html with its title (in <title>: a page draws no big title) and one empty board (data-board-id="main"), and
page.json with the title; it goes last in the sidebar's head. The server puts in the scripts and styles
of the blocks its cards hold. Says where it wrote and what to write next, and with the shared Gallery server
running ends with the 交给用户 line gallery open has: the page's whole address, to send the user at once
(without one, gallery page open <slug> --no-browser gives it).
Exits 1 when the slug is taken (a document's, a page's, the trash's) or kept (exports, components, pages,
assets, materials…). Before the server's first start in the workspace makes the default home page (with
its own cards; gallery open --no-browser starts one), gallery page open, add, try and check of home say
so in place of "no such page".`,
    },
    {
      name: "list",
      summary: "the pages in the sidebar's order, each with its address (--json for a script)",
      usage: ["gallery page list [--json]"],
      text: `list says the workspace's custom pages in the sidebar's order (the order the user dragged them to, then
gallery.json's pages.order, then by title): each one's slug, icon and title, its address (地址：, the whole address with
the shared Gallery server running, else /#@<slug>, after the port of a server) and where its page.html is;
in a workspace with no page whose home page is not made yet, only that the home page waits for the server.
A page in the trash (gallery trash, the sidebar's 移至回收区) is not listed.
--json prints one JSON object instead, 2-space indented, and nothing else: { "workspace": its absolute
path, "server": { "port" } of the shared Gallery server (null when none runs), "pages": [{ "slug",
"title", "icon" (null for none), "defaultCards" (whether page reset-cards works on it), "address" (as
地址 says it), "file" (the absolute path of its page.html) }] in the sidebar's order, "homeNotMade": whether
the default home page waits for the server's first start }; the fields are only ever added.`,
    },
    {
      name: "open",
      summary: "start the server if none runs and open the page in the browser",
      usage: ["gallery page open <slug> [--no-browser]"],
      text: `open starts this workspace's Gallery server (or uses the one running), as gallery open does, and opens
the default browser at the page in the workbench (--no-browser, or GALLERY_NO_BROWSER=1, opens none).
Prints the workspace, the server, the page alone (the Agent's own: /pages/<slug>) and last the address
to give the user (/#@<slug>).
Exits 1 when there is no such page or no server answers.`,
    },
    {
      name: "add",
      summary: "put a card of a block on a page, its settings written with it (--set)",
      usage: ["gallery page add <slug> <block> [--board <id>] [--x <n> --y <n>] [--w <n>] [--h <n>] [--set <key>=<value>]…"],
      text: `add puts a card of a custom block on a board of the page (--board, else main, else its first): the
block's id (local/water) or the name of one of Gallery's own the workspace has (gallery block add puts
one in), a block whose manifest's places hold page. The card takes the block's default size (its
card.sizes' first, else card.w and card.h; one with no h 2 high, where the page's own 添加自定义块 makes it
as high as its content) at the first free spot (the topmost row it fits in, its leftmost column), or the cells --x and
--y (and --w, --h, held to the block's sizes or its min and max: one that writes a min or a max beside its sizes takes any whole size between them) say, the cards it meets pushed down,
never one moved up; its data-card-id is the lowest c<n> no card holds, and every card of the page gets
one it lacks. Written through the workspace's running server when there is one (the queue an open
page's own gestures go through: the page shows the card at once; a block put in a moment ago is
waited for until the server takes it, a few seconds at most), else into page.html, which is kept
first (.gallery/state/pages/<slug>/, the last 20), every other byte of it as it was. Prints the card's
id and cells, and the cards it pushed. Each --set <key>=<value> writes a setting of the block (its manifest's
settings: weather's city, countdown's date) into the card's settings part as it is added, in the same
write, as the card's own grip › 设置… would, the value held to the setting's type (a number, a date as
YYYY-MM-DD, a select's one of its options, a switch's true or false): --set city=上海 --set unit=℉. The
words after the first "=" are the value, whatever the shell does to quotes (no JSON to quote). A block that
has a setting it cannot show anything without (required: weather's city, countdown's date), added with
none, says so after the card: ask the user for it, or take it from what the workspace says.
Exits 1 when there is no such page or board, or the block is not in the workspace, is turned off or is a
document's alone; 2 for a --set of a setting the block has not, or a value its type refuses, nothing written.`,
    },
    {
      name: "set",
      summary: "change a page's title or icon (the sidebar's 重命名)",
      usage: ["gallery page set <slug> [--title \"<title>\"] [--icon <emoji|icon|none>]"],
      text: `set changes a custom page's title or icon as the sidebar's 重命名 does: its page.json's title (the
same function the workbench's rename calls) and icon (none takes it away), every other field of page.json
as it was; at least one of --title and --icon. An icon is an emoji or an icon of the 图标 tab
(/icons/<name>_<color>.svg, Tabler's /icons/tabler/<name>_<color>.svg, the colors gray, lightgray, brown,
yellow, orange, green, blue, purple, pink, red), not a picture. page.html is not touched: its own <title> is
the page's, which an Agent writes. The sidebar shows the change at once (the server watches page.json).
A title that starts with "-" and a letter is written --title="-Q3 回顾".
Prints what changed.
Exits 1 when the page is not there or page.json does not read; 2 for a title that is empty or over 200
characters, or an icon that is none of these.`,
    },
    {
      name: "move",
      summary: "move a page's row in the sidebar's head (--after another page, or --first)",
      usage: ["gallery page move <slug> (--after <page> | --first)"],
      text: `move puts a custom page's row in the sidebar's head (新建, 搜索 and each page, in the order the user
drags them to) right after another page's row (--after), or before the first page's row (--first; 新建
and 搜索 stay where they are). Written through the workspace's running server when there is one (an open
workbench shows it at once), else here, in the outline file under its lock, every other thing of it as it
was. Prints the pages in their new order (as list says them). A page that is where it is asked to be
changes nothing (exit 0).
Exits 1 when a page named is not there, or --after names the page itself; 2 for none or both of --after
and --first.`,
    },
    {
      name: "card",
      summary: "change one card of a page: its settings, its place or size, or take it off",
      usage: ["gallery page card <slug> <card id> [--set <key>=<value>]… [--move <x>,<y>] [--size <w>,<h>] [--narrow]", "gallery page card <slug> <card id> --remove"],
      text: `card changes one card of the page, as the card's own gestures do, through the page service (every gesture
of the page and page add go through it: the open page shows the change at once; no server running, the same
code writes page.html here, the file kept first as add keeps it). The card is named by its data-card-id (page
check lists them; a card with none has the lowest c<n> its page gives it). --set <key>=<value> writes a
setting of its block into the card's settings part, as page add --set does (each value held to its
setting's type; the words after the first "=" are the value); --move <x>,<y> puts it at other cells
(whole numbers, x from 0 and y from 0, on its board), --size <w>,<h> gives it another size (w 1 to 12, h at
least 1, held to the block's sizes or its min and max; a block that is not resizable refuses): both in one
write, the cards it then meets pushed down, never one moved up. With --narrow, --move and --size act on the
board's narrow view instead (8 columns, its own layout, what a window too narrow for twelve shows: a drag there
does the same), the wide places as they were. --remove takes the card off the page
(alone: nothing goes with it): its data goes with it (page.html as it was is kept in
.gallery/state/pages/<slug>/, the last 20 versions), and gallery page add puts a new card of its block
in. With --move or --size and --set together the place is written first, then the settings. A card another writer changed between the read and the write is read again (three tries).
Prints the card's cells and the settings now.
Exits 1 when the page, the card or its block is not there, or the service refuses (the card is not
resizable, page.html would grow past 1,000,000 bytes); 2 for a --set of a setting the block has not or a
value its type refuses (nothing written), cells that are not whole numbers, none of the options, or
--remove with another.`,
    },
    {
      name: "reset-cards",
      summary: "put back the default cards a page misses (the page's menu 恢复默认卡片)",
      usage: ["gallery page reset-cards <slug>"],
      text: `reset-cards does for a page what its menu's 恢复默认卡片 does, through the page service (restore-defaults): of
the default blocks the page has (its page.json says "defaultCards": true, as the default home page's does;
Gallery's today, weather, countdown, habit, stats, todos, heatmap, recent, note and static) it puts a card of
each that no card of the page holds, at the first free spot by its default size, Gallery's own block put into
the workspace first; every other card and byte as it was, nothing pushed. Prints the cards it put back
(id, block, cells) and the default blocks it could not (turned off, not there), or that the page holds
them all. Written through the workspace's running server when there is one (the open page shows them at
once), else here.
Exits 1 when the page is not there or has no default cards.`,
    },
    {
      name: "try",
      summary: "make a reader's gestures on one card, and say what they wrote",
      usage: ["gallery page try <slug> <card id> --press <selector> [--then <key>] [--keep]", "gallery page try <slug> <card id> --drag <selector> --to <selector> [--keep]", "gallery page try <slug> <card id> --key <selector> <key> [--keep]", "gallery page try <slug> <card id> --type <selector> <words> [--replace] [--then <key>] [--keep]", "gallery page try <slug> <card id> --select <selector> <value> [--then <key>] [--keep]", "gallery page try <slug> <card id> --steps <file> [--keep]"],
      text: `try makes what a reader does on one card of the page, named by its data-card-id, and says what it wrote:
gallery block try's gestures (--press, --drag … --to, --key, --type, --select, --then) and steps
(--steps <file>), made in the page with the pointer and the keys on the card's instance, each selector
the first element of the instance it finds (gallery block --help says each). It makes them on a scratch
copy of the page (<workspace>/.gallery/try/try-<8 hex>/, gone at the end, whatever came of it):
page.html is not written, and no page of the user's shows the trial; --keep makes them on the page itself
and leaves what they wrote. It starts the shared Gallery server (or uses the one running) and opens the
copy's page alone (/pages/<slug>), editable, in Chrome or Edge, headless, in a profile of its own. A
write is what the page's board sends the page service, as the user's gestures go: once each is
answered, a Gesture line (Step N with --steps) and a Wrote line say each data part of the card's
instance (its settings among them) with the lines it took out and put in, those lines under it (- and
+), and that nothing else in page.html changed (card ids aside, which the page service gives the cards
that have none). Only the card's data parts may change: a write anywhere else (the card's place, its
own markup, another card, the page's own HTML) is a problem, said with what it changed. Then the page's
own undo, Ctrl+Z pressed once for each write it took, the last first, the focus taken off a field of the
card first (an Undone line: the copy as it was, card ids aside); --keep presses none (a Kept line). Then
a fresh page of what the steps wrote (a second copy, or page.html with --keep), where the card is to
mount, write nothing as it opens and show what it showed after them of what they wrote (a Read back
line). Last, a picture of the card's instance after the steps, <workspace>/.gallery/qa/<slug>/try/after.png,
its absolute path printed: open it, and the 下一步 line lists it. --replace goes with --type, as
gallery block try's does.
Exits as gallery block try does: 0 the steps wrote, the undo took it back (or --keep kept it) and a fresh
page read it back; 1 a problem of the block's (gestures that wrote nothing, a write outside the card's
data parts, an undo that left part of a write, a fresh page that shows it otherwise or writes as it
opens), or no such page, a card holding no instance, a block that does not load, is turned off or is a
document's alone; 2 a mistake in the command line (a card the page has not, a selector that finds
nothing in the instance, a steps file that does not read); 3 when the trial was not seen through
(UNVERIFIED: no server or browser, a page that loaded itself again).`,
    },
    {
      name: "check",
      summary: "what is wrong with a page, what changed in it, and its pictures",
      usage: ["gallery page check <slug>"],
      text: `check says what is wrong with the page, each problem a FAIL line with its line in page.html, and what
changed in it. Its structure (a page's own scripts, frames and stylesheets are none of its problems):
where it has boards or cards, its boards in <main class="gallery-page">, each board's data-board-id and each
card's data-card-id there, of lowercase letters, digits and hyphens, and once in the page, each card a
board's child holding one instance, its data-x, data-y, data-w and data-h whole numbers on the board
(0 <= x, 1 <= w <= 12, x + w <= 12, 0 <= y, 1 <= h <= 24) and sharing a cell with no other card of its
board, its block in the workspace, loading, not turned off and with page in its places; and each file of
the page's own named (assets/<file>: the folder pages/<slug>/assets/, which the server serves at
/pages/<slug>/assets/<file>) there, and no frame's but a picture's (the server serves a page's own
pictures by their type, its stylesheets and scripts as such, and any other file as bytes for saving: a
frame of a file there downloads it, while a link, a font, a video or audio uses the bytes), a picture,
stylesheet or script written relative any other way being one nothing serves. Then the cards with their ids and cells, and the changes since the page as
the last check that found nothing saw it (or, before any, since the version the page service kept before
its last write): cards added, removed, moved (to another board too), resized, their data parts changed
(with the lines), a card's own markup, the page's own HTML; each change the page wrote since, a gesture
of the user's there (not gallery page add's), ends "(the user's, on the page)": leave it as it is. Then
the page itself, a scratch copy of it on the shared Gallery server (started
or used, as gallery page open does), in Chrome or Edge at 1280, 1920 and 600px wide (a narrow board: fewer
columns of the same 64px cells), light and dark: a card whose content does not fit it, a card drawn out of its board, the page
wider than the window, a block that failed, a picture that does not load, what the console says; each
look pictured whole, <workspace>/.gallery/qa/<slug>/check/<width>-<theme>.png (emptied each run), the
pictures listed and then, on a line of their own, those not opened yet: open them.
Exits 1 when anything is wrong (or there is no such page); 3 when nothing is and the page could not be
looked at (UNVERIFIED: no server or browser), its structure checked all the same; else 0, the page then
what the next check tells its changes against.`,
    },
  ],
};
