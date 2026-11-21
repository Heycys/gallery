// What each gallery command says of itself (gallery help <command>, gallery <command> --help): its
// first line "Usage: gallery <command> …", the rest what it does, what it prints and its exit codes.
// Kept here, not as comments at the top of each command's file (the release bundles the commands,
// and a bundle keeps no comments), and loaded alone by gallery.mjs: help and --version import
// nothing else. Every command also takes --workspace <dir> (the workspace it works in: gallery help).
// The usage of gallery block and gallery page is kept by subcommand in ./usage-sections.mjs (which imports
// nothing either): USAGE.block and USAGE.page are the whole of it, helpText says a line for each subcommand
// or one in full.

import { BLOCK_SECTIONS, PAGE_SECTIONS, overviewUsage, subUsage, wholeUsage } from "./usage-sections.mjs";

export const COMMANDS = ["init", "new", "import", "open", "serve", "stop", "sandbox", "preview", "preferences", "startup", "check", "export", "qa", "list", "read", "workspaces", "move", "set", "link", "extension", "block", "page", "skill", "trash", "duplicate", "copy", "favorite", "column", "notes", "status", "history", "revert", "doctor", "emoji"];
/** Other names of commands: gallery component … is gallery block …, its name before custom blocks were called so. */
export const ALIASES = { component: "block" };

const WORKSPACE = `The workspace (the folder of your documents) is --workspace <dir>, else GALLERY_WORKSPACE, else the
nearest folder up from here holding gallery.json (gallery init makes one), else ~/Documents/Gallery (on Windows
the Documents folder Explorer shows, OneDrive's when OneDrive backs it up): the default workspace, the
sidebar's 默认文档 (GALLERY_DEFAULT_WORKSPACE names another folder in its place).`;

const NAMED = `A document is named by its slug, by its link (周报-k3xv9q2a, what gallery list shows after /#) or by a
whole address, as a user hands one over (http://127.0.0.1:8080/#周报-k3xv9q2a, a block's id after a / or not): the
words in a link are a label, and a title changed since leaves the address good.`;

export const USAGE = {
  preview: `Usage: gallery preview <page.html> [--out <file>] [--open] [--shots <dir>] [--only <names>]
       gallery preview new <name>
Build a standalone interactive HTML preview with current Gallery styles, theme and width controls.
Local scripts/styles are embedded. --shots uses the same Chrome/Edge tooling as gallery qa.
It executes trusted page code only in its isolated browser profile; it edits no Gallery documents.
See references/previews.md for configuration and screenshots.`,
  preferences: `Usage: gallery preferences list [--json] [--all]
       gallery preferences on|off <name>
With no arguments, list is the default. List enabled global writing preference files in their configured order. Read the files relevant to
this writing task by title and scope. --all also shows disabled files (for managing preferences).
Every file lives in <home>/preferences/. A new workspace starts with 通用写作.md, Gallery's generic default;
an older <home>/preferences.md is moved to 项目报告写作.md.
Names may be the displayed title or relative path. Only change files, order or enabled state when
asked by the user. Files are never moved when disabled.`,
  sandbox: `Usage: gallery sandbox [start] [--name <name>] [--extension <dir>]... [--from <workspace>] [--demo] [--open] [--keep]
       gallery sandbox list
       gallery sandbox env <name>
       gallery sandbox stop <name>
Start an isolated Gallery in the foreground on a free loopback port and print its URL and folder.
--open opens the URL. Ctrl+C or sandbox stop closes the service and removes its temporary files.
--keep leaves the files for inspection. --demo makes sample documents. --from copies a workspace's
documents and content settings, leaving out links to other workspaces, Gallery's network keys and runtime state.
Each --extension copies and enables a trusted source directory. Changes reinstall the copy and keep
its current enable setting; its workbench script activates again. Installed extension backends
run with your OS permissions. Use sandbox env in a separate shell to point Gallery CLI at the sandbox.
Sandbox start chooses its own workspace. Use --from to try a copy of another workspace.`,
  startup: `Usage: gallery startup [status|enable|disable|run]
Show or change this user's login startup setting (JSON). Windows and macOS installed packages
enable it on the first service start by default. enable/disable also update the operating system;
the choice persists across upgrades. run is the silent login launcher: reuse the shared service
and saved port, never open a browser. gallery stop stops it until the next login or gallery open.
Source checkouts, npx caches and GALLERY_NO_AUTOSTART=1 never register login items.
Exits 1 if the system cannot apply the setting; 2 for an unknown action.`,
  init: `Usage: gallery init [<dir>] [--from <old reports dir>] [--name "<name>"]
Makes a workspace: <dir> (else the workspace found as every command finds it) with its gallery.json
only (never over a gallery.json that is there); the home workspace also gets its application folders. Prints 工作区：<abs>（新建 or 已有）.
--name writes the workspace's name in its gallery.json (the project's: what the sidebar and gallery
workspaces call it; else its folder's), said as 名字：<name>; gallery workspaces --name changes it.
The workspace goes on this machine's registry, as every command's does (gallery workspaces).
--from copies the documents of an older Gallery (its reports/ folder: one folder a document, each
holding report.html or doc.html) into the workspace: every document whose slug is free here (the
others listed as skipped), its preferences.md when the workspace has none, the sidebar's order, the
写作偏好 page, the custom emoji and the documents' recent versions. The old folder is only read:
nothing there is changed, moved or deleted.
Only the default workspace gets its home page (首页, pages/home/: Gallery's today and note cards),
as a server's first start gives it, said in a line; once made, nothing makes it again.
Exits 1 when the workspace cannot be written or --from names no folder; 2 for a name that is empty,
over 80 characters or more than one line.`,

  new: `Usage: gallery new <slug> "<title>" ["<description>"] [--under <document> | --column "<column>"] [--after <document> | --first] [--no-preview] [--open]
A new document in <workspace>/<slug>/ from the starter: its doc.html, holding the starter's section
to replace, and doc.json, with the title and the description (新文档 when none is given, New document
on a system whose language is not Chinese: the starter's lang and the words of its section follow the
system's language too, or GALLERY_LANGUAGE=zh|en). Where it goes
in the sidebar's tree: under --under's document, last (first with --first), or right after --after's
(at that one's level); --column "<column>" puts it last (first with --first) at the top of that
sidebar column (gallery column new makes one; a column of this workspace's, not another workspace's or
an extension's); neither, at the top level of the own column, last. A document is named there by its
slug, link or address (gallery help says how), and must be there, not in the trash; the 写作偏好 page
holds none.
Then says where it went (Placed it …), where it wrote (the workspace), where the user's writing preferences are (写作偏好,
<home>/preferences/, to read first: 通用写作.md made from Gallery's default when there are none yet) and
the next steps (下一步：, the first: send the user the address now; 提示： gallery qa, which exports first), and last starts the one Gallery
server (or uses the one running: it runs on after this command) and prints the address to give the user,
as gallery open does. It opens no browser: the user opens the address you send (--open opens the
default browser at the document, and says whether it did). In a workspace other than the
default one, the document also joins the default workspace's sidebar (when there is one), in its
workspace's column: a line says where, 默认工作区（…）的侧边栏：已加进…; it is a display only, the file stays in
its own workspace. --no-preview (or
GALLERY_NO_PREVIEW=1) leaves the server alone; --no-browser is still taken and changes nothing.
Editing needs Chrome or Edge.
A title or a description that starts with "-" and a letter would be read as an option: put "--"
before the arguments (gallery new q3-review -- "-Q3 回顾").
Exits 1 when the document exists, or the slug is the workspace's own (exports, the 写作偏好 page's) or
a document's in the trash, or a document --under or --after names is not there (nothing made), or
the new one could not be placed (made, at the top level); 2 for a document named that is in the trash,
and for --open with --no-browser.`,

  import: `Usage: gallery import <file> [<slug> ["<title>"]] [--no-preview] [--open]
New documents made of a file, as the workbench's 导入 makes them: Markdown (.md .markdown .mdx .txt
.text), HTML (.html .htm .xhtml, a Gallery export too), a table (.csv .tsv), Word (.docx), PDF (.pdf,
its text), EPUB (.epub) or a .zip of them (a Notion export: one document a page, nested as there).
The first document's title is the argument's, else the file's (front matter, first heading, name);
its slug the argument's, else made of the title's Latin words (lowercase kebab-case, a number added
when it is taken, as gallery new would refuse it). The pictures a Markdown file links to by relative addresses are copied into
<slug>/assets/. Then says what it made, what it could not bring as the file has it (by line), the
text the preview leaves read-only, the workspace, 写作偏好, the next steps (the first: send the user
the address now), and last, as gallery new does, the server's address to give the user, at the first
document (--no-preview, or GALLERY_NO_PREVIEW=1, leaves the server alone). No browser is opened but
with --open, as gallery new opens it.
Put "--" before a title that starts with "-" and a letter.
Exits 1 when the file is not there, cannot be read, or gallery new would refuse the slug; 2 for a
kind it does not take, and for --open with --no-browser.`,

  open: `Usage: gallery open [<slug>] [--no-browser] [--present] [--settings extensions]
Starts this workspace's Gallery server (or uses the one running: it runs on after this command, its
log in <data>/logs/server.log), waits until it answers, and opens the default browser
at the workbench, or at the document <slug>, at its block when an address names one (--no-browser,
or GALLERY_NO_BROWSER=1, opens none).
--settings extensions opens the extension list in Settings.
--present (with a document) opens the document in the workbench's 演示视图 (full-screen show, no editor): the address
to give the user is the workbench's with ?present before the #; the workbench shows the document that way once it has
opened it, and takes ?present off the address (a browser goes full screen only on the reader's own click, so the show
fills the window instead). The Agent's own page and the other lines are the same.
${NAMED}
Prints the workspace, a line on the server only when there is news (it started now, an older one
was replaced, or it is on another port than the last command found it on: an address given before
no longer works), the document's page alone (the Agent's own, with a slug) and last
the address to give the user. With a slug in a workspace other than the default one, a line before
them says the document joined the default workspace's sidebar (as gallery new's does). Editing needs Chrome or Edge: open the address there.
With a slug and no qa baseline yet, it first keeps one of the document as it is now, so that the
first gallery qa after the changes pictures what changed.
Exits 1 when there is no such document, no server answers, or the shared Gallery server takes the
request and gives no answer (a second server is never started beside it); 2 for --present without a document or
with --settings.`,

  serve: `Usage: gallery serve [--port <n>]
Runs the shared Gallery server in the foreground until Ctrl+C (gallery open runs one in the
background instead). Prints the address once it answers. --port picks the port (else the last one
this Gallery data directory used, else the first free one from 8080).
Exits 1 when this shared server runs already (its address said) or the port is taken.`,

  stop: `Usage: gallery stop
Stops this workspace's Gallery server, the one gallery open or gallery new started: it finishes the
saves in its queue first. A server npm run dev runs (Gallery's own development) is stopped where it runs.
Exits 0 when it stopped or none runs, 1 when it could not be stopped.`,

  check: `Usage: gallery check [<slug>...] [--allow-failures]
Checks each named document (none named: every document of the workspace) on its own.
${NAMED}
Reads it as its preview shows it (natural HTML made the kit's in memory) and writes nothing: what the export will
write as the kit's markup is printed by line, and the blocks it will give an id (each at its line
when they are ten at most); first, once, what the preview wrote as the kit's markup when the reader
edited the document, and the 批注 it deleted because their words are gone. Problems to act on first
("fix") come before the others ("note").
It also holds a document to what must stay whole in it, each failure saying how to mend it: a
data-block-id that is not an id Gallery made (eight lowercase letters and digits, a letter first: only
Gallery makes one, so take the attribute off and let gallery export give the block one), an id moved
off a list item onto the paragraph in it (put it back on the <li>), and a folder of the workspace whose
doc.json says "instructions": true (that marks the 写作偏好 page, which hides the folder from Gallery:
take it out; naming such a folder, or naming none, checks it). A doc.json title or icon that is not the
page's is noted with the command that changes both together (gallery set <slug> --title/--icon).
Exits 1 when a document fails, unless --allow-failures.`,

  export: `Usage: gallery export <slug>... [--allow-failures] [--original-images]
       gallery export --all [--allow-failures] [--original-images]
       gallery export <slug>... --format pdf|markdown|html [--paper A4|A3|Letter|Legal|Tabloid] [--scale <percent>]
               [--no-files] [--subpages [--folders]] [--out <folder>]
       gallery export <slug>... [--allow-images <https sources>] [--embeds-as-links] [--out <folder>]
Hands each named document in: its doc.html (report.html in an older document) written as its
preview shows it, natural HTML as the kit's markup and every block given an id (through the
shared Gallery server while one runs); then checks it and writes one standalone offline file per
passing document, <workspace>/exports/<slug>.html. A document the quick checks fail is not handed in.
${NAMED}
It says first, once, what the preview wrote when the reader edited a document and the 批注 it deleted;
then the failures ("FAIL <slug>: N problems"), the exports made, the notes to act on first ("fix")
and the others ("note"), what the hand-in wrote by line (the kit's markup, block ids, a title or icon),
and last, for each document exported, 离线文件（用户要文件时再给）： and the export's absolute path.
Exits 1 when a document fails, unless --allow-failures.
The offline file's pictures are copies as light as the page needs (the document's own files stay as they are):
at most twice the reading column wide (1424px; none narrower at 全宽), a PNG (a screenshot) and a JPEG wider
than that written as a WebP of quality 0.9, which the user's Chrome or Edge draws; an SVG, a GIF, an animation
and one already light as they are. Under its "Exported" line: "  pictures: N of M made lighter for the page …",
and those the browser could not read (each as it is), or that there was no browser to (they are as they are then;
the notes then name the heavy ones, as gallery check does). --original-images embeds every picture as it is.
The PDF, a Markdown export and --no-files take none of this.
--format makes the file the workbench's 导出 dialog makes, by the same function, with the dialog's options:
  --format pdf|markdown|html   the page as a PDF (Chrome or Edge prints it), as Notion-style Markdown, or as the
                               offline file (--format html alone, with its files, is the export above)
  --paper, --scale             a PDF's paper (A4, the default, A3, Letter, Legal, Tabloid) and scale, a percentage
                               above 10 and below 200 (100, the default); for --format pdf only
  --no-files                   the document's pictures and files left out (the dialog's 文件和图片除外; their links stay)
  --subpages [--folders]       the documents under it in the sidebar's tree too, each its own file (包含子页面), each page's
                               subpages in a folder named as it with --folders (为子页面创建文件夹; else all at the top)
  --out <folder>               the folder to write in (made when it is not there) instead of <workspace>/exports/
With --format the file is written as the workbench's 导出 writes it, whatever the checks find: each document (and,
with --subpages, each under it) is handed in and checked first, and what fails is said after the failures as
问题：<slug> 没通过检查… with its lines, exit 0 (mend it, gallery check says it again, and export again); only an
export that cannot be made fails (exit 1). One file is written as it is, named by the slug:
<slug>.md, <slug>.pdf, <slug>.html; a Markdown page that links pictures or files, a chart's picture, or subpages make
<slug>.zip, as the dialog downloads one: its pages named by their titles, the pictures and files in assets/ beside
them. An html file without its files (--no-files) is <slug>-no-files.html, never the offline file's name. A PDF needs
Chrome or Edge (GALLERY_BROWSER names one). Without --format, --no-files, --subpages, --folders and --out imply
--format html.
For a program that publishes the offline file on another platform (an extension's backend: it puts the file's
pictures there and their web addresses in the file), two options of the html file, which no other format takes:
  --allow-images <sources>     its pictures may load from these https sources too, which its policy (no network)
                               blocks otherwise: https: (any https address) or origins, https://cdn.example.com or
                               https://*.example.com (a port may follow, no path), separated by commas or the
                               option given again; anything else is refused (exit 2). Rewriting the file's policy
                               instead breaks the day its words change: this option is the interface
  --embeds-as-links            each embed block a link to the page it shows (the bookmark's card), for a platform
                               that strips frames; an embedded file of the document, which a reader elsewhere
                               cannot open, its name alone
Either implies --format html. Unlike the dialog's, such a file is held to the checks as the offline file is
(a program publishes it unread): a document that fails, or one under it with --subpages, is not written, exit 1
unless --allow-failures. In <workspace>/exports/ such a file is <slug>-web.html (<slug>-no-files-web.html with
--no-files, <slug>-web.zip with --subpages): <slug>.html is always the offline file that reaches nothing. Under its
"Exported" line, a file whose pictures may load from the network says so: "  network: its pictures may load from
<sources> …".
Prints, after the failures and notes, each file made ("Exported <absolute path> (<bytes> bytes)", a zip's files
listed), the hand-in's lines, and last 交给用户（PDF）：, （Markdown）：, （Markdown 压缩包）：, （离线文件）： or
（离线文件，不含文件和图片）： with the file's absolute path, for each document.
Exits 1 when a document fails, unless --allow-failures; 2 for options that do not go together (--paper without
--format pdf, --folders without --subpages) or a value it does not take.`,

  qa: `Usage: gallery qa <slug>... [--tiles] [--blocks <id,…>] [--no-export] [--pictures]
       gallery qa --all [--tiles] [--no-export]
Looks at each named document's export (<workspace>/exports/<slug>.html; one with none yet, or one not
made from its doc.html and its custom blocks as they are now, is exported first, as gallery
export does, unless --no-export) as a reader's browser shows it: Chrome or Edge, headless, at 1024, 736 and 360px wide
and in a laptop's 1024×768 window, every disclosure open, each Sheet and detail card shown in turn.
${NAMED}
Each finding is said with its place in the document's file (doc.html:<line>, report.html:<line> in
an older document): fail (errors, broken pictures, charts that drew nothing, the page wider than the
window…), warn (columns or rows out of sight, overlapping text…), info, unverified (no browser, a
wait that ran out…). It takes every picture it needs in this one run, and leaves no second run to
make: the flagged elements; every block changed or moved since the last look (a moved one with the
edges of the blocks around it; a block held by one of them that its picture did not show at a width,
pictured on its own there); the cards not changed yet not pictured before (all of them the first time,
and when nothing changed: the twelve a run pictures at most, changed blocks among them; the rest need no
look, and stay for a later run); --tiles: the page in tiles; --blocks <id,…> (one document only; the ids
split at commas or spaces, and one the document has not refused before anything is looked at): the
blocks named. Each run's pictures go to a folder of their own,
<workspace>/.gallery/qa/<slug>/<the run's time>/ (2026-11-11_14-02-33; flagged/, changed/, cards/,
blocks/, tiles/ in it), and qa keeps the last 5 runs of each document and takes the earlier ones away as a
run ends, so nothing needs remembering of what is emptied. First, once, as gallery check says them, what the
preview wrote when the reader edited the document and the 批注 it deleted. Then the findings, each look's
counts, and (a --blocks run) the changed blocks and cards it did not picture, which a plain run does. The
pictures to open are named once, last before the verdict, in ONE list: 要看的图（N 张）, numbered: one
picture of each place a FAIL or a WARN names (the narrowest width it was flagged at), then the blocks
--blocks named, the tiles; by its whole path and what it is; 要看的图（0 张） when nothing needs a look. Then
不用看：, what needs no look: the pictures of the blocks changed and the cards (the checks looked at them;
they stay in the run's folder), the cards past the twelve, INFO notes, blocks hidden from readers; then the
verdict, and last, on a line of its own, the export's absolute path after 离线文件（用户要文件时再给）：. Fix the
FAILs and run it again until nothing fails; a picture listed is there for when a finding's words are not enough. --pictures lists every picture
the run took instead (这次拍的图: each flagged place at each width, the blocks changed, the cards), to open
what a question about how one block looks needs of them.
GALLERY_BROWSER=<executable> picks the browser. A browser that does not start is tried once more
with a fresh profile.
Exit codes: 0 nothing failed (a warning never fails); 1 something failed (or the export it ran first did);
2 an export is missing or stale with --no-export, or --blocks names an id the document has not; 3 nothing
could be looked at at all (UNVERIFIED <why>: no Chrome or Edge, or one that did not start); 4 the pages
were looked at and some places could not be verified (an UNVERIFIED line among the findings names each: a
wait that ran out, a picture not taken).`,

  list: `Usage: gallery list [<words>...] [--json]
       gallery list --tree [<document>] [--json]
       gallery list [<words>...] --all [--json]
The workspace's documents, for an Agent to find the one the user means: each one's slug and title,
its description, where it is in the sidebar's tree when it is under another (位置：the documents above
it, from the top), its address (地址：/#<link>, after the port of the shared Gallery server), when its file
was last written and where that file is, the one edited last first.
With words, only those whose title, description or slug holds any of them (case alike, Chinese found
inside words), the best first, then those whose text holds them, each with its first place there
(正文：…); with a document's link or whole address, that document, or that it is in the trash.
When exactly one document is found by those words, the last line is the address to give the user with the
handoff (交给用户（交稿时给；…）： and the workbench's whole address, while a server runs; else a 提示 line saying
none runs and how to get it then).
--tree lists them as the sidebar shows them, in its order, each under the one it is under, indented
two spaces a level: a line each, its slug, its title (its emoji before it), its description and its
last edit. --tree <document>: that document and the documents under it, after its 位置 line.
The sidebar's web links (gallery link) are listed too, each with 网页链接：its address: after the
documents (with words, those whose name, address or slug holds one), and in their place in --tree.
With columns besides the own one (the sidebar's 栏: each other registered workspace has one, with its
documents; 默认文档 is the default workspace's), --tree lists them column by column, each under its name
(one removed from the sidebar is left out), and 位置 starts with the column's (位置：团队栏 › …) for an
entry outside the own column; a document outside its own column says that column (「默认文档」的文档).
${NAMED}
First, the workspace and where 写作偏好 is (made from Gallery's default when there is none yet).
--all searches every workspace of this machine (gallery workspaces lists them, the current one
always among them) by the title, description and slug of each document (not its text), the best
first (no words: all, the one edited last first), each after the line 工作区：<path> of its
workspace, which --workspace takes to work on it there; it only reads: nothing is written in any of
them, and 写作偏好 is not made. A workspace no longer there is named at the end, not searched.
--json prints one object instead (an Agent reads it, not the text; fields are only ever added to):
{ "workspace": path, "documents": [{ "slug", "title", "icon" (or null), "description", "link" (the
words and page id of its address), "address" (/#<link>), "path" (its doc.html), "parent" (the slug
it is under, or null), "column" (its sidebar column's name), "columnId", "favorite" (true when the
sidebar's 收藏 holds it), "look" (the font and layout of its own: doc.json's look, { "font": "serif" },
none left out when it follows the workspace), "edited" (ISO time), "hit" (with words: the first place
its text holds them) }], "links": [{ "slug", "title", "url", "icon", "parent", "column", "columnId",
"favorite" }] }. --tree: the same in the sidebar's order, each with its "depth", and "drafts" (the
other workspaces' documents the sidebar holds: "entry", "title", "workspace", "path", "missing",
"parent", "column", "favorite", "depth"). --all: each document with its "workspace" and the
"workspaces" searched. The trash is never in it (gallery trash list --json).
Exits 1 when --tree names a document that is not there, 2 one in the trash.`,

  workspaces: `Usage: gallery workspaces [--json]
       gallery workspaces --scan [<folder>]
       gallery workspaces --name "<name>"
       gallery workspaces --forget <path>
       gallery workspaces --show <path or id> [--doc <slug>] [--register]
       gallery workspaces --hide <path or id> [--doc <slug>]
The workspaces of this machine: every workspace a gallery command or a Gallery server has worked in
is registered in a file of the user's (GALLERY_DATA_DIR,
else %LOCALAPPDATA%\\gallery\\workspaces.json on Windows, ~/Library/Application Support/gallery on macOS,
$XDG_STATE_HOME/gallery or ~/.local/state/gallery elsewhere). Lists them, the current one first (*),
then the one edited last first: each one's name (its gallery.json's, else its folder's; the folder
above it, or its own path, after the name when two are called alike), its id (ws- and six hex
digits), its path (路径：), how many documents it has and when one was last edited (文档：), and its
one shared service address printed above the list (服务：); one whose folder or gallery.json is gone is marked 不在了
and stays registered (a drive may come back).
--scan registers the workspaces in <folder> and below it, 6 levels down at most (not in node_modules,
.git, a dot folder or the recycle bin): the Documents folder when none is named. --name names the
current workspace (gallery.json's name, the workspace made first when it is not there). --forget
takes a workspace off the registry, named by its path or its id; nothing on disk changes (a command
run in it registers it again). Nothing else is written, and no file of a workspace is ever removed.
gallery list <words> --all searches the documents of every one.
--json prints the list as one object (fields only ever added to): { "current": path, "service": { "port",
"pid", "address" } or null, "workspaces": [{ "id", "name", "path", "current", "default", "named" (it has a
name of its own), "exists", "documents" (count), "lastEdited" (ISO time or null) }] }.
--show is the sidebar's 添加其他 Gallery 项目…: the workspace named by its folder or its id, whole, as a
column of the sidebar (its folder is registered now when it is a workspace not yet on the registry;
a folder that holds Gallery documents but is no workspace is made one only with --register); with --doc
<slug> that one document of it (and those under it). --hide is 从侧边栏移除: the workspace's column hidden
(its workspace, files and registry untouched: what --forget is not), or with --doc <slug> that one
document taken out of the tree (从文档树移除; the document is not touched). Both are written as the
sidebar's menu writes them, through the running server when there is one. This Gallery's sidebar lists
every registered workspace and does not read those hidden marks: --hide then says so (提示：), exits 1
and names --forget as the way to take a workspace off every sidebar.
Exits 1 when --scan names no folder, --forget no registered workspace, --show or --hide a workspace or
document that is not there, or the name cannot be written; 2 for a name that is empty, over 80
characters or more than one line, and for two of --scan, --name, --forget, --show and --hide at once.`,

  move: `Usage: gallery move <document> (--under <document> | --top | --column "<column>") [--after <document> | --first]
Moves a document in the sidebar's tree, with the documents under it: under --under's document, to the
top level (--top), the top level of a sidebar column (--column "<column>", a column of this workspace's),
or where it is now (none of them); right after --after's document (one at that level, whose level it is
when none of them says one), first (--first), else last. Written
through the workspace's running server when there is one (an open workbench shows it at once), else
here. Nothing in the documents' files changes: links between documents go by their folders, which
stay where they are.
${NAMED}
Prints where it went and where it was, then its place (位置：…, as gallery list says it).
Exits 0 when it moved or is there already; 1 when a document named is not there or is the 写作偏好 page
(listed apart: it moves nowhere and holds none), when the place is under itself or a document under
it, or --after names one at another level, or --column names no column of this workspace's; 2 for a
document in the trash.`,

  set: `Usage: gallery set <document> [--title "<title>"] [--icon <icon>|none] [--description "<text>"]
                         [--font sans|serif|mixed] [--size small|default|large] [--spacing compact|default|loose]
                         [--width narrow|default|wide] [--full on|off] [--wide-tables on|off] [--all]
Changes a document's title, page icon, description or look as the workbench's 重命名, the page's icon
picker and its 字体与布局 menu do: the title in doc.html (the h1 of its header, and <title> where that holds the h1's words,
else the whole of it) and in doc.json; the icon in the header (div.doc-icon before the h1: made,
changed, or taken away with none) and in doc.json; the description in doc.json. An icon is an emoji,
an icon of the 图标 tab (/icons/<name>_<color>.svg, Tabler's /icons/tabler/<name>_<color>.svg, the
colors gray, lightgray, brown, yellow, orange, green, blue, purple, pink, red), a picture of the
document's folder (assets/<file>) or the name of a custom emoji of the workspace (自定义表情, gallery emoji
list; :name: too), whose image is copied into the document's assets/ as the icon picker copies it.
doc.html is written as an Agent writes it, the rest of it as it
is: the page open in the browser shows it, and the workbench's sidebar the new title and icon.
A title that starts with "-" and a letter is written --title="-Q3 回顾".
--font (等线体 sans, 衬线体 serif, 混合体 mixed: the title and headings serif), --size (字体大小), --spacing (正文间距),
--width (正文宽度), --full on|off (全宽: the page at the full width of its area) and --wide-tables on|off (宽表格:
a table wider than the text, standing in the body itself, centred and past the text on both sides, as far as the
page's edges, scrolling only past those) set the look the document shows, in the look of its doc.json, as the 字体与布局 menu does, and the page open in the browser changes at
once (the command goes through the shared Gallery server while one runs). Only the choices named are written: the
document's other choices of its own stay, and a choice that is the default (--font sans) is a choice all the same,
kept in doc.json against the user's default look. --all (应用到全部文档) makes the look the document shows (these
choices included; alone it applies the look it has now) the default look of every document, kept with the
user's settings, no document's file: the documents with choices of their own keep them.
${NAMED}
Prints what changed (each field, and the file it is in: doc.json for the look).
Exits 1 when the document is not there or is the 写作偏好 page, its page has no h1.doc-title, its
doc.json does not read, or the picture is not in its folder; 2 for an icon that is none of these or a look value
that is not one of the choices.`,

  link: `Usage: gallery link add <url> "<name>" [--column "<column>"] [--under <entry>] [--after <entry> | --first] [--icon <emoji>]
       gallery link set <link> [--url <url>] [--title "<name>"] [--icon <icon>|none]
       gallery link remove <link>
A web link of the sidebar: a page of the web (http or https) the workbench shows beside the sidebar,
in a frame (a site that refuses frames is offered 在浏览器中打开), in the tree with the documents. It is
a folder <workspace>/<slug>/link.json (no document: nothing checks, exports or searches it), its slug
made of the name's Latin words, else the site's name. A link is named by its slug or its link (what the
workbench's address holds after #).
add puts it first in the own column (the workspace's own documents'; as the sidebar's 添加在线网页…
puts one first in its column); --column first in the column of that name (as the sidebar calls it, or
one the user named), --under last under an entry (a document or a link), --after right after one.
Prints where it went (位置：…, as gallery list says it). The site's own icon (its page's <link rel=icon>,
else /favicon.ico; 16 KB at most) is fetched once and kept in link.json, shown when no --icon is given.
An address of this workspace's own server (its host and port) is refused: link the document instead.
set changes its address, its name or its icon (an emoji or an icon of the 图标 tab; none takes it away).
remove moves it to the trash, which the workbench's 设置 › 回收区 restores it from, where it was.
Each is written through the workspace's running server when there is one (an open workbench shows it
at once), else here.
Exits 1 when a link, a column or an entry named is not there or the server refuses it; 2 for an
address that is not http or https, an empty name, or two places at once.`,

  extension: `Usage: gallery extension new <id> "<name>" [--ui] [--server]
       gallery extension list [--json]
       gallery extension check <id> [--shot <file>] [--press <button>]
       gallery extension settings <id> [<key>=<value>...] [--json]
       gallery extension install <folder | .zip> [--enable]
       gallery extension enable <id>
       gallery extension disable <id>
       gallery extension remove <id>
Extensions live in <home>/extensions/<id>/ and are shared across workspaces.
A sidebar.json supplies a column of links; a program's columns/<column>.json (written by its backend,
GALLERY_EXTENSION_COLUMNS) more columns, shown while it is enabled. An extension.json declares workbench script/style,
backend server.command, icon and Agent instructions. Either or both may be present.
new without flags creates sidebar.json. --ui and/or --server create a program template,
version 0.1.0, AGENT.md, activate/dispose UI and/or a Node HTTP backend with GET /health; with both,
the UI's button asks the backend's GET /hello through Gallery's proxy and toasts the answer.
Edit the files, run check, then enable. check validates the manifest and every declared file,
starts an isolated sandbox copy (even if disabled), waits for the backend to listen and checks UI
errors and slot buttons in Chrome/Edge. --shot writes a screenshot. --press clicks the slot button with
that label (or text) and prints each request it makes to the backend's api/ with its status and answer,
the toasts shown and errors thrown; a failed request, an error toast or a throw fails the check.
Failures include backend exit code and the last 20 log lines, paths and script addresses given as the
extension's own files. A sidebar-only check prints its tree and notes as before.
check never enables the original extension or writes its workspace. It runs the extension's code
with the user's OS permissions, as sandbox does. Check only extensions you trust.
Install replaces extension files, preserving the enabled setting unless --enable is passed.
list prints capabilities and AGENT.md paths; --json prints { folder, extensions: [...] } (the extensions
folder even when empty; each with backend and workbenchError status, and settings: its settings' values).
settings prints the settings an extension.json declares ("settings": [{ key, type, label, default, help }],
type boolean), each with its value, and the file its backend reads them from (GALLERY_EXTENSION_SETTINGS);
<key>=<value> pairs (true or false, on or off) set them as the switches on its detail in 设置 › 拓展列表 do,
through the running Gallery, which tells its open pages (api.settings); --json prints { id, enabled, file,
settings: [{ key, type, label, help, default, value }] }. Setting is refused while the extension is
disabled, for a key it does not declare and for a value of another type. remove deletes its settings too.
A workbench script must export activate(api) (there is no window.gallery); check fails without it.
Changed files reload activate/dispose UI and restart a running backend.
Exits 0 on success, 1 when validation/runtime fails, 2 for invalid arguments.
See references/extensions.md for the public UI API, manifest and sidebar.json format.`,

  // The usage of the commands with subcommands is kept by subcommand (./usage-sections.mjs): the text here is the whole of it.
  block: wholeUsage(BLOCK_SECTIONS),

  page: wholeUsage(PAGE_SECTIONS),

  trash: `Usage: gallery trash <entry>...
       gallery trash list [--json]
       gallery trash restore <item>...
       gallery trash empty [<item>...]
Deletion goes through the trash: never rm a document's folder (that leaves the sidebar's tree and the
history holding it). Moves entries of the sidebar to the trash as the workbench's 移至回收区 does (its
trash command, written through the workspace's running server when there is one, so that an open
workbench shows it at once, else here): a document with its files, a custom page (gallery page list) or
a web link, each named by its slug, its link or whole address, or its whole title when only one has
it. A document keeps its place in what the trash records; the documents under it move up to where it
was, none goes with it (as in the sidebar). Prints each one with its trash id and where it was, and
that gallery trash restore puts it back.
list: what the trash holds, the one moved last first: each item's id, kind, slug, title and where it
was. --json prints one object: { "workspace": path, "items": [{ "id", "kind" ("document", "page" or
"link"), "slug", "title", "trashed" (ISO time), "at" (ms), "parent" (the document it was under, or
null), "column" (its column's name, or null), "place" (words), "workspace" (whose trash holds it) }] }.
A custom page lives in the default workspace, so its trash is that workspace's.
restore puts items back where they were (named by id, slug or whole title): under the same document,
else at the top level of the column, else at the top level; under the next free slug when theirs was
taken meanwhile. Prints the place (位置：…, as gallery list says it).
empty deletes items of the trash for good, all of it with none named: the one command of Gallery that
deletes anything and cannot be undone. Use it only when the user explicitly asks for it.
A document of another workspace (an entry ~ws-…/<slug>) is trashed in its own workspace: --workspace.
Exits 1 when an entry or item named is not there, is the 写作偏好 page or is another workspace's (nothing
is moved when one of them is wrong); 2 for a name that is no slug, link or address, and for a document
named that is in the trash already.`,

  duplicate: `Usage: gallery duplicate <document> [<new slug>] [--title "<title>"] [--no-preview] [--open]
A copy of a document, as the document menu's 创建副本 makes one (its duplicate command, through the
workspace's running server when there is one, else here): the whole folder, assets included, under a
new slug (doc-<a new page id>, or <new slug>), with a new page id and none of the original's
annotations, history or review of the Agent's changes, titled the original's with （副本） after it (" (copy)" on a
system whose language is not Chinese; or --title's words as they are), right after the original in the sidebar's tree. Never copy the folder
yourself: that copies its block ids, annotations and history too.
${NAMED}
Prints where the copy is (位置：…) and its file, then ends as gallery new does: the next step (下一步：
send the user the address now), the one Gallery server found or started (--no-preview leaves it alone),
and last the address to give the user (交给用户…：). No browser is opened but with --open, as gallery
new opens it.
Exits 1 when the document is not there, is a web link or the 写作偏好 page, or the new slug is taken
(nothing is copied); 2 for a slug that is not lowercase kebab-case or is a name the workspace keeps, an
empty title, a document in the trash, and --open with --no-browser.`,

  copy: `Usage: gallery copy <document> --to <workspace> [--under <document>]
Copies a document, with the documents under it, to another workspace, as the sidebar's drag into
another workspace's column does once it is confirmed (复制到另一个工作区？): new documents there (new
slugs and page ids, their files, assets and metadata), the originals and their history staying where
they are. <workspace> is a registered workspace's ws- id or its folder (gallery workspaces lists
them; a folder that is a workspace is registered now). The copy goes last at the top level of that
workspace, or last under --under's document there (a slug or link of that workspace). Made by the
receiving workspace's own copy-from command, through the machine's running server when there is one,
else here.
${NAMED}
Prints what was copied and where, the copy's file and, as the next step (下一步：), how to work on the
copy: every command takes --workspace <its folder>.
Exits 1 when the document is not there, is a web link or the 写作偏好 page, is in that workspace
already, or --to names no workspace or --under no document there (nothing is copied); 2 for a document
in the trash.`,

  favorite: `Usage: gallery favorite <entry> [--off]
Puts an entry of the sidebar (a document or a web link, named by its slug, link or whole address, or
its whole title when only one has it) in its 收藏 section, or takes it out with --off, as the entry's
menu does. The list is kept in the outline file (.gallery/outline.json, beside the tree), by the
workspace's own favorite command (through the running server when there is one), and the workbench's
browsers show it besides the favorites each keeps itself; gallery list --json says "favorite" for
each entry. Says what changed, or that nothing needed to.
Exits 1 when the entry is not there or is a custom page (which has no 收藏); 2 for a document in the
trash.`,

  column: `Usage: gallery column new "<column>"
       gallery column rename "<column>" "<new name>"
       gallery column remove "<column>"
The sidebar's columns (栏), made, renamed and removed as the column's menu (新建栏, 重命名, 从侧边栏移除) does,
written through the workspace's running server when there is one (an open workbench shows it at once),
else here. A column is named by its name as the sidebar shows it (case alike) or its id (gallery list
--tree shows them). new makes one last in the sidebar (nothing when a column of that name is there
already). rename changes a column's name. remove deletes a column the user made, the entries in it with
those under them going last to the workspace's own column, no file deleted; a workspace's column is
hidden instead (gallery workspaces --hide); the own column (默认文档 in the default workspace) and an
extension's column are never removed. gallery new and gallery move take --column "<column>" to put a
document in one. Prints what changed and the columns now.
Exits 1 when a column is not there, is the own column or an extension's, or the outline cannot be
written; 2 for an empty name.`,

  notes: `Usage: gallery notes <document> [--json]
       gallery notes done <document> <id>... [--undo] [--json]
       gallery notes remove <document> <id>... | --done | --all [--json]
The reader's 批注 (annotations) of a document: suggestions for you, each about words of the document or
blocks of it, kept in <document>/annotations.json (never edit that file: these commands are the way).
A document is named by its slug, its link or its address, as for every command of documents.
gallery notes <document> lists them in page order: each one's id, the blocks it is about (their
data-block-id; "whole" when it is the blocks themselves), where it is (the headings above it), the words
it is about (quote), the suggestion (text), and whether it is done. Act on the suggestion in the file by the
block ids, then mark it: that is how the reader sees what you have dealt with.
gallery notes done <document> <id>... marks them as acted on: on the page their cards go grey, and the
reader can delete all the done ones at once (the menu of the 批注 button: 删除已处理). 复制批注 leaves them
out. --undo takes the mark off. A suggestion the reader rewrites afterwards is a new one: no longer done.
gallery notes remove deletes: the ids named, every one marked done (--done), or all of the document's
(--all, as 全部删除 does). Only when the reader asks you to; marking done is the default way to finish
with one. A removal can be taken back: with the page open the reader sees 已删除 N 条批注 with 撤销 (a few
seconds); with no page open it cannot be undone, so say what you removed.
Each is written through the workspace's running server when there is one (an open page shows it at once:
the edit service's route, in the queue the page's saves go through), else here, by the same code, on the
file as it is (nothing is checked against the document, so nothing is deleted or reordered by it).
Every id named must exist, else nothing changes. --json prints one object, then adds fields, never
changes them: for the list { "document": <slug>, "title", "file": <the document's path>, "notes": [ { "id",
"text", "quote", "blocks": [data-block-id...], "whole": <the blocks themselves>, "where": [<headings>],
"done", "created", "updated" } ] }; for done { "document", "done": [ids] } (or "undone"); for remove
{ "document", "removed": [ { "id", "text", "quote", "done" } ] }.
Exits 1 when the document or an id is not there or the server refuses; 2 for a command line that is
wrong (no ids, two ways to remove at once).`,

  read: `Usage: gallery read <document> [--format full|markdown|text|html|json] [--json]
       gallery read <document> --outline | --map [--json]
       gallery read <document> --block <id> | --section <id|"heading words"> [--format …]
A document as one reads it, to read instead of a script of your own: it writes nothing (no file, no
block id, no export), needs no server, and reads doc.html as the file is now, also while the server runs
and the reader edits. A document is named by its slug, its link or its address, as for every command of
documents; also by another workspace's address (~ws-<id>/… in it, as gallery status names one) or by
the path of its doc.html or folder. An address naming a block reads that block.
--format full, the default: every block of the page in reading order, nothing dropped. A head first
(title, file, lines, last edit, description, the page's own style and script by their lines), then a
row per line, its left column the line in doc.html where a block starts and its data-block-id. What
Markdown says well is Markdown (headings, paragraphs and their marks, lists, to-dos, quotes, code,
formulas, tables); what it cannot is written as what it is, between ┌─ <name> and └─ (sections,
callouts, highlight panels, the opening summary, disclosures, tabs tab by tab, columns, flowcharts
step by step, detail cards with the links that open them, cards: a chart's type and its data or the
table it is drawn from, a drawing's words and its own HTML or SVG, pictures, files, bookmarks and
embeds with their fields and files, whole blocks and custom block instances with their data, own HTML
and slots), a list, a quote, a table and a code block opening with a ── <name> line; {…} after a block
is its classes and attributes as the file has them (colors, alignment, sizes). It ends by saying all
blocks are there, or with a 提示 line listing exactly what could not be shown, by line.
--format markdown: the Markdown the export writes (as the workbench's 复制页面内容): lossy, a comment at
its end saying what it left out. text: the words alone. html: the file's own text of the page's <main>
(or of the part read), exactly, to edit by exact spans (the whole lines while the file still holds HTML
Gallery will rewrite as its own). json (or --json): one object, then adds fields, never changes them:
{ "document": { "slug", "title", "icon", "description", "file", "workspace", "lines", "edited" },
"format", "mode", "part": null | { "option", "words", "line", "endLine" }, "natural" (the file holds HTML
the export or the reader's first edit rewrites as the kit's), "unsaved": null | { "save", "conflicts" },
"code": [ { "tag", "line", "endLine", "charts" } ], "blocks": [ { "n" (reading order), "id"
(data-block-id or null), "kind", "type" ("unit", "wrapper", "loose"), "name", "level" (a heading's),
"parent" (its container's n), "index", "depth", "place" (a tab's or slot's name), "line", "endLine",
"tag", "text", "markdown", "html", "attributes", "data" (a list's kind, a table's cells, a chart's
type and data, a picture's file…), "children" (their n) } ], "missing": [ { "n", "line", "why" } ] }.
--outline: the headings in order (as the page's 目录 lists them), indented by level, with their line,
id and how many blocks their section holds; --map: every block on a line, indented by depth.
--block <id> reads one block with what it holds; --section <id|"heading words"> a heading's section (the
heading and what follows it up to the next heading of its level or higher, as the page folds it), or the
section the block named stands in; either in any format.
What it prints is for reading: to change the document, edit doc.html itself by exact spans; never write
the file back from what gallery read printed. A 提示 line says when the reader's page has edits not saved
yet or a conflict (the file is behind it), and when the file still holds natural HTML.
${NAMED}
Exits 1 when the document, the block or the heading is not there (or several headings have those words);
2 for a mistake in the command line (a custom page, @<slug>, is no document).`,

  status: `Usage: gallery status [--json]
What the reader has open in the browser, from the running server: every document and custom page open in
a tab of the workbench, the one used last first. Use it when the reader says "this document", "this
paragraph", "here" without naming it: the first one is that, at the selection (else at the caret). It
only asks: it starts no server and makes no workspace. With none running it says so (exit 0).
For each: its slug and title, its file (the one to edit), whether the tab is shown and the window has the
focus, how long ago the reader last did something there, where saving stands (已保存, 有修改还没保存, 有冲突,
or 没连上服务), how many 批注 it has, the caret's block (its data-block-id, null for a block the file has
no id for yet, and its words) or the words and blocks selected (200 characters at most), as the file
names them. 问题： lines name an open document that is not saved (changes waiting, or a conflict): ask the
reader to settle it on the page first, then change the file, or he gets a conflict card for your write.
The tabs report to the server every 20 seconds and when something changes; a tab that closed is gone at
once, one that stopped reporting after 90 seconds. Everything stays in the server's memory, on this
computer (the selected words need the server's token to read).
--json prints one object, then adds fields, never changes them: { "running": false, "open": [] } when no
server runs, else { "running": true, "port", "open": [ { "tab", "kind": "document" | "page", "slug",
"title", "file", "workspace", "visible", "focused", "idle": <seconds>, "save": "saved" | "pending" |
"conflict" | "offline", "conflicts": <number>, "notes": <number of 批注>, "caret": { "block", "text" } |
null, "selection": { "kind": "text" | "blocks", "blocks": [data-block-id...], "text", "truncated",
"length" } | null } ], "last": <the first of open, or null> }. A page of another workspace has
"~ws-<id>/<slug>" for its slug (its "file" is where it is).
Exits 0; 1 when the server does not answer.`,

  history: `Usage: gallery history <document> [--json]
       gallery history <document> --changes <version> [--json]
       gallery history <document> --restore <version> [--json]
A document's recent versions, as the workbench's 历史版本 lists them (the document's ··· menu): Gallery
keeps the file as it was before and after each of its own writes (the user's edits on the page, a
revert, a restore, an export's block ids, a rename) and as each write of anyone else's left it (the
Agent's Write or Edit, a write while no server ran, which the next server keeps as it starts), the last
30 of them and the last of each hour before those, 80 at most, in <workspace>/.gallery/state/history/.
Lists them, the newest first: its version (the first 8 characters, what --restore takes), when it was
kept (local time), who made it (用户: the user's edit on the page, 撤回, 恢复 in the workbench; Agent: a
write of the file, a command of an Agent's, a page opened with ?agent; 未知: the first one kept, and one
kept before Gallery said who), what made it, and what it changed of the one before it: how many blocks
it added, changed and deleted, and the first of those blocks with their kind, data-block-id and first
words. The one the file holds now says （现在的样子）.
--changes prints what that version changed of the one kept before it, every block (what the workbench's
历史版本 marks on the version's page): 加了 and 删了 with the block's words, 改了 with its words before and
now (原来：, 现在：) for each of its text blocks that changed, or 没有字可比 for one whose attribute,
picture, chart's or component's data changed; the first one kept has none before it.
--restore writes that version as the file (a version is named by those 8 characters, 6 at least, or its
whole id or version), through the workspace's running server when there is one (its queue: an open page
shows it at once; a page with edits not saved yet keeps them), else here: what the file was is kept as a
version first, so a restore is taken back by restoring that one (said on the 提示 line); doc.json's
title and icon follow the page's. The restore is the Agent's write: the page marks what it changed as
the Agent's changes, for the user to keep or revert (gallery revert takes it back too). Prints the
blocks it took back of the file (去掉了 what the version has not, 改回了, 放回了 what the file had not).
${NAMED}
--json: one object. The list: { "document": { "slug", "title", "file" }, "current" (the file's version
now), "versions": [ { "id", "version" (16 hex), "short", "time" (ISO), "by" ("user", "agent" or null),
"kind" ("commit", "write", "revert", "undo", "restore", "hand-in", "rename", or null), "from" (a restore's:
the id restored), "current" (true for the newest, when the file holds it), "counts" ({ "added",
"changed", "removed" }, null for the first), "blocks" ([{ "change" ("added", "changed", "removed"),
"kind", "name", "tag", "id" (data-block-id; null for none and for one deleted), "text", "title" }], 8 at
most), "more" (how many blocks besides) } ] }, the newest first. With --restore: { "document",
"restored" (the id restored), "same" (the file said it already: nothing written), "kept" (the id of the
version that holds what the file was), "id" (the version it made), "counts", "blocks" } (40 blocks at most).
With --changes: { "document", "version" (as in the list), "previous" (the id of the one before it, null for
the first), "counts", "blocks": [{ "change", "kind", "name", "tag", "id", "text" (its words now; a deleted
one's as it was), "title", "texts" ([{ "before", "now" }], of one changed), "whole" (one changed with no
words to tell) }] }, every block.
Exits 1 when the document is not there, no version has that name or several do (the 问题 line names
them), or the file kept changing (an Agent writing it: nothing written); 2 for a mistake in the command line.`,

  revert: `Usage: gallery revert <document>
Takes back the Agent's changes since the user last kept (确认) or reverted them, as the page's
「撤回」 does (the bar at the page's bottom): the document as the user had it before the Agent's first
write since, with the user's own edits saved meanwhile kept in it; doc.json's title and icon follow the
page's. Through the workspace's running server when there is one (its queue: an open page shows it at
once; a page with edits not saved yet keeps them), else here by the same code, on the same state. What
the file was is kept as a version first: gallery history <document> --restore <version> brings it back
(the 提示 line says which); the page's own 撤销 stays the page's, for the tab that reverted there.
${NAMED}
Prints what it took back (how many writes, how many blocks), a line each block (去掉了加的 what the
Agent added, 改回了 what it changed, 放回了删的 what it deleted, with its kind, data-block-id and first
words).
Exits 1 when there is nothing to take back (问题 and 下一步 lines say so: the user kept or reverted the
Agent's changes, or no Agent wrote the document since, the write that replaced a new document's starter
being no change; gallery history is the way to an older version
then), when the document is not there, or the file kept changing (an Agent writing it: nothing written);
2 for a mistake in the command line.`,

  doctor: `Usage: gallery doctor [--json]
Is this machine ready for Gallery: one line each, and the one thing to do first. Run it when a command is
not found or prints 需要处理：…, and do what its last line says.
Looks at: Node (22.13 or newer); this Gallery, and whether npm has a newer one (read from the small cache
gallery --version keeps, never waited for: a stale cache starts the background check, and the next run
knows); the Gallery skills installed where gallery skill install writes them (Claude Code's and Codex's
homes, and this folder's .claude/ and .codex/), older or newer than this gallery; whether the workspace
can be written (when it is not made yet, the folder it would be made in; another program's gallery.json
is a problem); a Chrome or Edge to look at pages with (GALLERY_BROWSER=<executable> picks one).
Each line starts 好 (nothing to do), 问题 (something to do) or 提示 (worth knowing, nothing to do). The last
line is 下一步：, the one thing to do first, by this order: Node, the workspace, the skill, a newer Gallery
(ask the user first: it changes their machine), the browser; when nothing is a 问题 it says 一切正常。
It makes no workspace and changes nothing (it writes a file into the workspace's folder to know that it can,
and takes it away).
--json: one object { "ok": whether nothing is a problem, "version", "workspace", "checks": [{ "id": "node",
"gallery", "skill", "workspace" or "browser"; "status": "ok", "problem" or "note"; "text"; and its own
fields: node and gallery "version" (gallery also "latest": the newest npm is known to have, or null), node
"required"; skill "installed": [{ "folder", "project", "version", "older" }]; workspace "path", "exists",
"writable"; browser "path" (null when none) }], "next": the one thing to do, or null }. Fields are only
ever added.
The other commands say 需要处理：… (运行 gallery doctor) as their last line when a skill installed is older
than this gallery (stdout, or stderr when the command failed; never with --json, help, --version or doctor;
nothing with GALLERY_NO_UPDATE_CHECK, CI or NO_UPDATE_NOTIFIER). A newer Gallery on npm is said by
gallery --version (新版本：…) and here, not by them.
Exits 0 when nothing is a problem, 1 else.`,

  emoji: `Usage: gallery emoji add <name> <image>
       gallery emoji list [--json]
The workspace's custom emoji (自定义表情: the page icon picker's "+"; kept in <workspace>/.gallery/emoji-library/).
add puts an image in the library under <name>, as the workbench's picker does: lower-case letters, Chinese characters
(and other letters without case), digits, - and _ (under 50 characters; white space becomes -, :name: is read as
name; upper-case letters are made lower-case), a name neither the library nor a standard
emoji has. The image is a PNG, JPEG, GIF, WebP, AVIF, SVG or ICO file of 2 MB at most, a path on this computer
or an http(s) address the image is downloaded from. Prints the library's file and, 下一步：, how to use it:
gallery set <document> --icon <name> copies the image into the document's assets/ and makes it the page's icon.
list prints the emoji (name and file); --json prints one object, { "workspace": <absolute path>, "emojis": [ { "name",
"id", "file" (in the library folder), "path" (absolute), "created" (ISO time) } ] }; the fields are only ever added to.
Exits 1 when the image is not there, is not an image or is over 2 MB, the address gives none, or the name is
taken; 2 for a name it does not take.`,

  skill: `Usage: gallery skill install [--agent claude|codex] [--project] [--dir <path>]
Writes the Gallery skill that matches this gallery command (what an Agent reads to write documents
with it: SKILL.md, references/, sdk/) where the Agent reads skills:
  Claude Code   ~/.claude/skills/gallery (CLAUDE_CONFIG_DIR/skills/gallery when that is set)
  Codex         ~/.codex/skills/gallery (CODEX_HOME/skills/gallery when that is set)
for each of them whose folder is there (neither: Claude Code's), or the one --agent names. --project
writes it into this folder's .claude/skills/gallery (.codex/skills/gallery for Codex) instead, for
this project alone; --dir <path> writes it into <path> itself, the skill's own folder, for any other agent.
A Gallery skill there is replaced (nothing done when it holds the same files). An older Gallery's
skill (the whole tools: package.json and src/, or reports/, its SKILL.md named gallery or
html-report-studio), there or anywhere in that skills folder, has its documents copied into the
workspace first, as gallery init --from copies them, and its exports into <workspace>/exports/ where
the name is free; then it is moved to <workspace>/.gallery/old-skill-<date>/ (never deleted), so that
the Agent sees one Gallery skill. Says what it did and where; then open a new Agent session.
Exits 1, changing nothing, when a target holds something else or an older skill's preview server
still runs (stop it first); 1 too when an older skill cannot be moved (its documents are copied).`,
};

USAGE.component = USAGE.block;

// The commands whose usage is kept by subcommand (./usage-sections.mjs), by name.
const SECTIONED = { block: BLOCK_SECTIONS, page: PAGE_SECTIONS };

/**
 * What gallery help <command> [<subcommand>] (and gallery <command> [<subcommand>] --help) prints, of
 * `command` (its other names too): { text } or, for a command with subcommands and a subcommand it has
 * not, { unknown: its subcommands' names }. A command with subcommands says what it is and a line for each
 * subcommand, and one subcommand in full; every other command (and a subcommand of a command that is not
 * kept by subcommand: gallery help trash list) is printed whole.
 */
export function helpText(command, sub = undefined) {
  const name = ALIASES[command] ?? command;
  const sections = SECTIONED[name];
  if (!sections) return { text: USAGE[name] };
  if (sub === undefined) return { text: overviewUsage(sections) };
  const found = sections.subs.find((one) => one.name === sub);
  return found ? { text: subUsage(sections, found) } : { unknown: sections.subs.map((one) => one.name) };
}

/** The usage lines of one subcommand of a command kept by subcommand (what a mistake in its command line is said with), or null. */
export function synopsisOf(command, sub) {
  const found = SECTIONED[ALIASES[command] ?? command]?.subs.find((one) => one.name === sub);
  return found ? found.usage.map((line, index) => (index === 0 ? `Usage: ${line}` : `       ${line}`)).join("\n") : null;
}

/** The lines of gallery block try in its usage, what a mistake in a command line of try is said with. */
export const TRY_SYNOPSIS = USAGE.block.split("\n").filter((line) => /^(?:Usage:)?\s*gallery block try /.test(line)).map((line, index) => (index === 0 ? `Usage: ${line.trimStart()}` : line)).join("\n");
/** The lines of gallery block pack in its usage, what a mistake in a command line of pack is said with. */
export const PACK_SYNOPSIS = USAGE.block.split("\n").filter((line) => /^(?:Usage:)?\s*gallery block pack /.test(line)).map((line, index) => (index === 0 ? `Usage: ${line.trimStart()}` : line)).join("\n");
/** The lines of gallery page try in its usage, what a mistake in a command line of page try is said with. */
export const PAGE_TRY_SYNOPSIS = USAGE.page.split("\n").filter((line) => /^(?:Usage:)?\s*gallery page try /.test(line)).map((line, index) => (index === 0 ? `Usage: ${line.trimStart()}` : line)).join("\n");

/** gallery help: the commands, one line each, and the workspace. */
export const OVERVIEW = `Usage: gallery <command> [options] [--workspace <dir>]
Gallery: documents written as HTML, edited in the browser, exported as one offline file.

  gallery init [<dir>] [--from <old reports dir>]   make a workspace (copy an older Gallery's documents)
  gallery new <slug> "<title>" [--under|--column]      a new document; starts the server, prints its address
  gallery import <file> [<slug> ["<title>"]]         documents made of a file (Markdown, HTML, Word, PDF…)
  gallery open [<slug>] [--no-browser] [--present]   start or reuse the server and open the browser
  gallery serve [--port <n>]                         run the server in the foreground
  gallery stop                                       stop the shared Gallery server
  gallery sandbox [start|list|env|stop]               test in an isolated Gallery instance
  gallery preview <page.html> [--open] [--shots <dir>] build an interactive UI preview
  gallery preferences list|on|off                    discover or manage writing preferences
  gallery check [<slug>...]                          check documents (none named: all)
  gallery export <slug>... [--format pdf|markdown]   write <workspace>/exports/<slug>.html (.pdf, .md)
  gallery qa <slug>... [--blocks a,b] [--tiles]      look at exports in Chrome or Edge; lists the pictures to open
  gallery list [<words>...] | --tree [<slug>] [--json]  the documents, those the words name, or the tree
  gallery list <words>... --all                      search the documents of every workspace of this machine
  gallery read <slug> [--outline|--block <id>|--section <id>]  a document, every block with its line and id (writes nothing)
  gallery workspaces [--json|--show|--hide|--name|--forget]  this machine's workspaces; show or hide one in the sidebar
  gallery move <slug> --under <slug> | --top | --column "<c>"  move a document (and those under it) in the tree
  gallery set <slug> --title|--icon|--description|--font…  a document's title, icon, description or 字体与布局
  gallery link add <url> "<name>" | set | remove     a web link in the sidebar, shown beside it
  gallery trash <entry>... | list | restore | empty  the trash: move to it, list it, put back, delete for good
  gallery duplicate <slug> [<new slug>] [--title]    a copy of a document, after it, titled （副本）/(copy)
  gallery copy <slug> --to <workspace> [--under]     copy a document (with those under it) to another workspace
  gallery favorite <entry> [--off]                   put an entry in the sidebar's 收藏, or take it out
  gallery column new|rename|remove "<column>"        the sidebar's columns (栏)
  gallery notes <slug> [done|remove <id>...|--done|--all]  a document's annotations (批注): list, mark done, remove
  gallery status [--json]                            what the browser has open and selected, and what is unsaved
  gallery history <slug> [--json] [--restore <version>]  a document's earlier versions; restore one
  gallery revert <slug>                              take back the Agent's changes since the user last confirmed
  gallery doctor [--json]                            check Node, Gallery, the skill, the workspace and the browser
  gallery emoji add <name> <image> | list            the workspace's own emoji (自定义表情)
  gallery extension list | check <id> | settings <id>  the extensions: their sidebar columns, as shown, and their settings
  gallery block new|add|list|show|check [<id>]       make, add, list, read and check custom blocks
  gallery block try <slug> --press <selector>        a reader's gestures on an instance, and what they wrote
  gallery block pack|menu|net on|off <name>          设置 › 组件列表's switches: a pack, a block in the menus, a block online
  gallery page new|list|open|set|move [<slug>]       make, list, open, rename and order custom pages (boards of cards)
  gallery page add <slug> <block> [--x --y --w --h] [--set k=v]  put a card of a block on a page, its id given
  gallery page try <slug> <card id> --press <sel>    a reader's gestures on a card, and what they wrote
  gallery page check <slug>                          what is wrong with a page, what changed, its pictures
  gallery page card|reset-cards <slug> [<card id>]   change, move, resize or remove a card; the home page's default cards
  gallery skill install [--agent claude|codex]       write the Agent's skill for this version
  gallery help [<command> [<subcommand>]]            this, a command's usage, or one subcommand's
  gallery startup status|enable|disable             background service at login (Windows/macOS)
  gallery --version                                  the version, then what is newer than it

${NAMED}
${WORKSPACE}
gallery --version prints the version first, then a line for each installed Gallery skill older than this
gallery (技能：…, with the gallery skill install that updates it) and one when npm has a newer Gallery
(新版本：…), which a cache knows: checked in the background once a day, never waited for;
GALLERY_NO_UPDATE_CHECK=1 (or CI, NO_UPDATE_NOTIFIER) turns that check off. No other command says them.
Editing in the browser and gallery qa need Chrome or Edge. Node 22.13 or newer.`;
