---
name: gallery
description: "Gallery: an agent-first, HTML-native document tool. You write a document as ordinary HTML; the user watches and edits it in the browser as you write it and gets one offline HTML file. Use when the user asks for Gallery (or $gallery); not for general front-end development."
---

# Gallery

A Gallery document is ordinary HTML that you write; the `gallery` command turns it into the kit's blocks, checks it and exports one offline file, while the user watches and edits it in the browser.

## Before anything: the gallery command

This skill holds the instructions; the tools are the npm package `@heycys/gallery`, the `gallery` command. This skill is Gallery 0.3.1's and needs `@heycys/gallery` ^0.3.1: 0.3.1 or a later 0.3.x.

- Run `gallery --version`. When `gallery` is missing or older than `^0.3.1` takes, ask the user (no need when they already said to install), then `npm i -g @heycys/gallery@^0.3.1`; if that cannot be done, `npx -y @heycys/gallery@^0.3.1 doctor` says what to do, and the same prefix runs any command. A version newer than `^0.3.1` takes means this skill is the older one: install nothing.
- `gallery --version` printing `技能：…` (this skill is older than the gallery) or `新版本：…` (npm has a newer one): tell the user in this task, with the command the line names. A command printing `需要处理：…`: run `gallery doctor` and do what its last `下一步：` line says. None stops the task: tell the user once, and update nothing without their yes unless they already said to.
- Workspace: `--workspace <dir>`, else `GALLERY_WORKSPACE`, else the nearest folder up holding `gallery.json`, else `~/Documents/Gallery`. `gallery workspaces` lists those this machine has used; `gallery list <words> --all` searches them all. Make a workspace only when asked.
- Commands return by themselves (the server runs on): run each in the foreground, with no `timeout`, background job or `Start-Process`. Ask the user to allow `gallery *` (`gallery.cmd *` in PowerShell); in PowerShell 5.1 give no `2>&1`. Resolve `references/` and `sdk/` from this file's folder.
- Users edit at the `交给用户（…）：` address in Chrome or Edge (`gallery qa` needs one too). In a cloud sandbox they cannot reach, skip addresses and hand over the export.

**写作偏好** (the user's writing rules): before writing or rewording, read the enabled files that bear on the task, by title and scope (the `写作偏好：` lines of `gallery list` and `gallery new` name them, as `gallery preferences list` does); a mechanical fix (a number, a typo, a script or a style) needs none. Priority: the user's request, the preferences in listed order, this skill. Change preference files, their order or on/off state only when asked ([references/preference-files.md](references/preference-files.md)). A custom page has none.

One Agent writes a document at a time; the user's browser edits merge with yours. A document is the folder `<workspace>/<slug>/`: `doc.html`, the page you write, and `doc.json`, its title, description and look (change them with `gallery set`). A document made before Gallery 0.1 has `report.html` and `report.json`: write those under their names. Below, `doc.html` and `doc.json` stand for either.

## Workflow

1. **Read the rules:** `gallery preferences list`, then the enabled files that bear on this document.
2. **Create it, send the address.** `gallery new <slug> "<title>" "<description>"` (a lowercase kebab-case slug), or `gallery import <file> [<slug> ["<title>"]]` for a file to turn into the document (Markdown, HTML, Word, PDF, …). It starts the server and ends with a `交给用户（…）：` line: send that address to the user now, in a message of its own, so that they can open the document while you work. Follow its `下一步：`; place the document in the tree as [Organizing documents](#organizing-documents) says.
3. **Write `doc.html`.** Read [references/writing-html.md](references/writing-html.md), whole, for a new document. For one block's markup, search [references/example-report.html](references/example-report.html) for its class (it shows every block once; do not read it through). Before a chart or a diagram, read [references/charts-and-figures.md](references/charts-and-figures.md).
   - Raw inputs that travel with the document go in `<slug>/materials/`.
   - A task board, a count or a bar chart of a table's rows counted or summed by a column, kept in step as the reader edits the table (tasks by status, a pipeline), is Gallery's own view of a table: an ordinary table with `data-doc-chart-source="<key>"`, then an instance of `gallery/kanban`, `gallery/metric` or `gallery/chart-view` with `data-doc-from="<key>"`. Run `gallery block add <name>` before you write the instance; `gallery block show <name>` prints how. Any other chart is one of yours (above).
4. **Export and check.** First, do the review 写作偏好 asks for, if it asks for one. `gallery qa <slug>` exports first whenever `doc.html` changed (the kit's markup and every block's `data-block-id` written into the page, the checks, the deliverable `<workspace>/exports/<slug>.html`), then looks at the export in Chrome or Edge. `gallery check <slug>` runs the checks alone; `gallery export <slug> --format pdf|markdown` writes the other formats (`gallery help export`).
   - Run `gallery qa <slug>`, fix each `FAIL`, and run it again until nothing fails. Its `要看的图（N 张）：` list has a picture of each place it flagged, for when a finding's words are not enough; nothing else needs a look (`不用看：`), though every picture is there to open.
   - `UNVERIFIED` (exit 3 or 4): do what its line says, installing nothing and taking no pictures of your own unless the user asks.
5. **Hand over** ([Handoff](#handoff)).

## What the commands print

A line that asks something of you starts with a fixed word, in Chinese whatever the user's language:

- `交给用户：` or `交给用户（…）：` an address or file for the user: copy it whole into your message when you give them one (after `gallery new`, and at the handoff).
- `下一步：` do it.
- `问题：` fails: fix each, run the command again (checks mark each `FAIL`, a pass `OK`). `提示：` advice, not a failure.
- `需要处理：` something outside the document (Node, the skill, the workspace, the browser): `gallery doctor`.
- Exit codes: 0 done, 1 something to fix, 2 a mistake in the command, 3 (and qa's 4) `UNVERIFIED`: not looked at, or in part.
- The lists (`list`, `workspaces`, `page list`, `block list`, `trash list`, `notes`, `history`, `status`) and `read` take `--json`, whose fields are only ever added to. `gallery help <command> [<subcommand>]` gives a command's options: look one up instead of guessing.

## Revising a document

- **Find it:** `gallery list <words>` prints each document's slug, title, place, address, last edit and file. An address the user gives names its document by the id at its end (every command that takes a slug takes it); one from another workspace can name this workspace's folder of that name, so compare the title and `工作区：` with what they mean. A path they give (复制本地路径) is that document's `doc.html`; its folder's name is the slug.
- **"This document", "here", "this paragraph":** `gallery status` first: the document open in their browser, the block they selected, each document's save state (a conflict or unsaved changes come as a `问题：` line): ask the user to settle them before you change the file.
- **Before you change anything,** read the applicable preferences (none for a mechanical fix); no address to send yet, it comes with the handoff. Gallery keeps the version before your change by itself: it is what 「Agent 的修改」 marks and `gallery revert` takes back.
- **What to read:** for words or numbers changed in place, nothing more; otherwise what your change needs of [references/writing-html.md](references/writing-html.md); a feature: [below](#output-contract). After the change, workflow steps 4 and 5.
- **Read it with `gallery read <slug>`**, not a script of your own: every block with its `doc.html` line and `data-block-id`, none left out (a long one: `--outline`, then `--section <id>`). It is for reading: edit `doc.html` itself, by exact spans; never write the file back from what it printed.
- **Edit small.** Replace only the part you change. A script may replace exact spans, each found once, in one write, stopping when a span is missing or repeated; write it for Node (`python` may be a stub). Write each file with the file tool, one per call (several heredocs in one Git Bash command fail). A change of several edits: make them one right after another.
- **Keep what is the user's:** the start tag of each block you change (`data-block-id`, `style`, classes may be their edits). A moved block, or one wrapped in a new container, keeps its id (cut and paste the element as it is); an id stays on its own element, not moved from an item or a container onto a paragraph in it; an added or copied block has none, and a deleted id is not reused; a split keeps the id on the first part, a merge the first block's; when unsure, drop it. `gallery check` reports a repeated or misplaced id.
- **A block made another** (a table made Sheet tabs, a list a flowchart) keeps what the old one held: numbers, units, scope line, colors. Say what could not go.
- **The export's `natural …` lines** say which elements it rewrote as the kit's markup (words and numbers stay): tell the user of the rewrites in what was there before your change.
- **Beyond the request:** you may change what the revision needs and name it in the handoff.
- **批注 (annotations):** `gallery notes <slug>` lists them, each `text` a suggestion on the `quote` it is anchored to. Work through them when the user asks: carry out each `text` where it is anchored, leave one that does not fit its words and ask in the handoff; where one conflicts with the request, the request wins: name it. `gallery notes done <slug> <id>…` marks those carried out; `gallery notes remove` only when the user asks (not `annotations.json` by hand). Gallery deletes an annotation whose words are gone, so keep the words in the blocks it is on. Say which you carried out, left, and which went with their words.
- **Undo** when the user asks: `gallery revert <slug>` takes back your changes since they last confirmed, keeping theirs (exit 1: nothing to take back); it prints the version it saved first, which `gallery history <slug>`'s `--restore` brings back. `gallery history` lists earlier versions.

## Organizing documents

`gallery list --tree` prints the sidebar's tree; a document is named by its slug, link or address.

- **New document:** where the user says (`gallery new … --under <document>`, last under it, or `--first`; `--after <document>`). With no place named, run `gallery list --tree` and put it under the document whose topic it belongs to, else at the top; say where in the handoff.
- **Move** only when asked: `gallery move <document> --under <document>|--top`, `--after` or `--first` for the place, with those under it.
- **Delete** with `gallery trash <entry>…` (a document, a custom page, a web link; the documents under a trashed one move up, as in the sidebar), not by removing folders, which leaves a broken sidebar entry. `gallery trash list` shows the trash, `gallery trash restore` puts one back; `gallery trash empty` deletes for good: only when the user explicitly asks.
- **Copy** with `gallery duplicate <document>` or `gallery copy <document> --to <workspace>`, not by copying the folder (block ids, annotations and history would come along).
- **Title, icon, description, font, layout:** `gallery set <document> --title … --icon <emoji, or none> --description … --font …` writes the header and `doc.json` together; edit neither by hand.
- **Columns, favorites, web links, workspaces in the sidebar:** `gallery column`, `gallery favorite`, `gallery link`, `gallery workspaces`. Extensions: `gallery extension list`, then the AGENT.md it lists ([references/extensions.md](references/extensions.md)). Report each place (`位置：`) in the handoff.
- **Custom pages (自定义页)** are the user's own pages in the sidebar, which you design when they ask ("首页加一张卡片…", "给我做一个读书页"). A page is no document (no 写作偏好, no export): read [Working on a custom page](references/pages-and-data.md#working-on-a-custom-page) first. Reorder, rename or trash pages only when asked.

## Output contract

- `<slug>/doc.html` and `doc.json` are the editable sources; `<workspace>/.gallery/` is Gallery's own; `<workspace>/exports/<slug>.html` is the offline, single-file deliverable, which `gallery qa` and `gallery export` write. Only when you hand one over (the user asks for a file, or a cloud sandbox they cannot reach), make it after your last edit and give that file or a copy, not `doc.html`.
- A document's words, data, charts and styles stay in `doc.html` and its `assets/`; the kit's blocks, styles and `sdk/` are not yours to change. A feature the user asks for, however small, is a custom block (in their 组件列表 and "/" menu), never a script or fixed words in one document: one that keeps what a reader enters (a ledger, a checklist, a form: `gallery block new <id> --data`), shows what changes by itself (when the document was made, last edited and by whom: [The workspace's data](references/pages-and-data.md#the-workspaces-data)), a reader's control (a filter, a toggle), or one to use again; one-off writing, a chart of the document's data or a look is content, and a table of contents is Gallery's 目录 (··· at the top right: tell them) unless wanted in the text. `gallery block list` first (`gallery block add <name>` adds one of Gallery's own), then [references/building-blocks.md](references/building-blocks.md) (a script: [references/block-script.md](references/block-script.md)). For a document that uses it too, make the document first (steps 1–2), then the block, the instance last.

## Handoff

- the document's address (the `交给用户（…）：` line of `gallery new`, or of `gallery list <slug>`; not when the user gave it to you or a `gallery status` you ran shows it open, nor in a cloud sandbox they cannot reach); the offline file (the `离线文件（…）：` line of `gallery export` or `gallery qa`) only when they ask for a file to send or keep;
- what `gallery qa` left flagged (a `WARN` you kept, a `FAIL` you could not fix), or that it could not run;
- where a document you made sits in the sidebar, and every move you made;
- for a revision: the blocks you changed, the changes the user did not name, what a conversion dropped, what a change of structure left side by side.

## References

A clickable UI proposal or standalone prototype: [references/previews.md](references/previews.md). Exact API types: `sdk/*.d.ts`, from [`sdk/index.d.ts`](sdk/index.d.ts).
