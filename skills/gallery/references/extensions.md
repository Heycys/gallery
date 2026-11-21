# Extensions: sidebar columns, workbench scripts and backends

An extension can add workbench buttons/panels, a backend service, a sidebar column, switches of its own in Settings, or a combination. Reuse Gallery's public UI API instead of reaching into private workbench DOM. Both program extensions and sidebar-only columns use the same extensions directory and settings list.

## Development workflow

1. `gallery extension new my-tool "My tool" --ui --server` creates a disabled program template that runs as it stands: with both flags its sidebar button calls the backend's `GET /hello` through the proxy (below) and toasts the answer, the round trip to build on. Use either flag alone for one capability. With no flags it creates the existing sidebar.json-only column.
2. Edit the generated files and AGENT.md, which describes how an Agent should use this extension. Never put account secrets in that file.
3. Run `gallery extension check my-tool --shot /absolute/path/check.png`. It validates extension.json and all declared files, starts an isolated sandbox copy, waits for its backend to listen, then checks its workbench script and lists slot buttons. `--press "My tool"` also clicks that button there and prints each backend request with its status and answer and each toast; a failed request, an error toast or a throw fails the check. Paths in its failures are your own files. A disabled original stays disabled. Failed backends report their exit code and last 20 log lines; UI failures report the extension's latest workbenchError. The sandbox isolates Gallery data, not OS permissions.
4. Enable it when requested: `gallery extension enable my-tool`. Use `gallery extension list --json` for current capabilities, backend status and workbenchError. UI errors from extension scripts/rejections appear in Settings too.
5. Edits anywhere under the extension directory (except dot files and node_modules) invalidate the revision. Running backends restart; activate/dispose modules reload with their dependencies. Keep generated data/logs in a dot directory to avoid restart loops.

For a visual proposal before implementation, see [previews.md](previews.md). Do not add a separate approval step when the user has already approved the implementation.

## Sidebar-only columns


An extension gives the sidebar a column of its own, beside the workspace's own column and those of the other workspaces: a list of links, nested if you like, that the user opens in the content area. Make one only when the user asks for it ("put my usual links in the sidebar", "an entry for my team's wiki"), or when a tool you are building must show entries of its own. A single web page the user wants in the sidebar is not an extension: `gallery link add <url> "<name>"` is.

All extensions live in the default workspace’s `extensions/<id>/`. `sidebar.json` supplies an optional column; `extension.json` independently supplies optional workbench scripts, styles, a backend and Agent instructions. Project-local extension folders are not read. `gallery extension new <id> "<title>"` creates an empty sidebar.json and prints its path. Read and edit that file; the command never overwrites it. Column order and hierarchy are stored in the shared tree.

- `<id>` is the folder's name: lowercase letters, digits and dashes (`yuque`, `team-wiki`), 48 characters at most, never `ws-` followed by six hex digits.
- Run `gallery extension list` first: it lists the visible extensions and their actual file paths, so you change one rather than make a second. `gallery extension check <id>` reads that same default-workspace source. Read the reported path rather than constructing a path under the current project.

## The file

```json
{
  "title": "语雀",
  "icon": "📗",
  "entries": [
    {
      "id": "team",
      "title": "团队知识库",
      "url": "https://www.yuque.com/team",
      "children": [
        { "id": "weekly", "title": "周报", "url": "https://www.yuque.com/team/weekly" },
        { "id": "notes", "title": "会议记录", "url": "https://www.yuque.com/team/notes", "icon": "📝" }
      ]
    },
    { "id": "mirrors", "title": "镜像站", "children": [
      { "id": "npm", "title": "npm", "url": "https://www.npmjs.com/" }
    ] },
    { "id": "panel", "title": "发布面板", "url": "http://127.0.0.1:4318/" }
  ]
}
```

| Field | Rule |
| --- | --- |
| `title` | The column's name. Required, 100 characters at most. The user can rename it from the column menu; Gallery writes the new title here. |
| `icon` | Optional, for the column and for any entry. An emoji, or an icon of Gallery's icon picker (`/icons/<name>_<color>.svg`). Never a picture from the web: nothing is loaded from a web address. An entry with no icon shows the column's. With neither specified, a parent with children shows a folder, a leaf shows the ordinary document icon, whether it has a URL or is an empty group. |
| `entries` | Required, a list (it may be empty). Each entry is an object. Up to 8 levels deep, 2000 entries in all. |
| `id` (entry) | Required, 1 to 128 characters of `A-Z a-z 0-9 . _ : -`, used once in the file, at any level. Keep it the same for as long as the entry is the same entry: the address bar, the open page and the user's place in the sidebar go by it. |
| `title` (entry) | Required, 200 characters at most. |
| `url` (entry) | Optional, `http` or `https` only (`javascript:`, `file:` and `data:` make the file unreadable). A click opens that page beside the sidebar. Without it the entry only holds its `children`: a click opens and closes them. |
| `children` (entry) | Optional, a list of entries. |

The file is at most 1 MB. Fields it does not know are ignored.

## What the user sees

- The column sits among the sidebar's columns. The user can fold it and drag its heading to another place. They can reorder its top-level entries by dragging before or after another root; Gallery writes the new `entries` order here, keeping each whole subtree. They can delete a top-level entry and its whole subtree, or delete the column, after confirmation. Root groups without a URL have this menu too; nested entries do not offer deletion. Deleting a column removes only its sidebar.json, keeping the extension’s other files. Columns update in every open Gallery tab. These operations do not delete the original web documents and cannot be undone. They cannot change nesting, drag entries into or out of it, or rename entries. Hovering the column name shows this file’s path.
- A click on an entry with a `url` shows that page in the content area, the way a web link is shown, filling the content area without a top bar. The right-click menu has 在浏览器中打开, 复制网址 and 在新标签页打开. A site that does not let other pages frame it gets a card with 在浏览器中打开 instead. Pages on this computer under another port (your own server) work; Gallery's own address does not.
- The address bar holds `#~<id>/<entry id>`, so an entry can be opened again from a link.
- A file that does not read shows the column with one row, `条目读不出来：<why>`, and no entries.

## Changing it

Read the latest file before changing it: the user may have renamed its column, reordered its roots or deleted entries in Gallery. Keep those changes unless asked to replace them; if sidebar.json has been deleted, do not recreate it unless the user asks. Write the file again: Gallery reads it again within a second of every change, the sidebar updates without a reload, and an entry the user has open stays open while its `id` is still in the file. When it is gone from the file, the user is told (这个条目已被扩展移除) and taken to the home page. Write a temporary file in the same folder and rename it over `sidebar.json`, so that no one reads half a file.

Check the file before you say it is done: `gallery extension check <id>` reads it as the sidebar does and prints what the sidebar will show, the column and each entry with its id, title and address. It exits 1 with the reason when the file would show `条目读不出来`; `note:` lines are only things it left out (an icon that is neither an emoji nor an icon of the picker). Read its output against what the user asked for: the entries in the order they asked, no entry missing.

Do not write `.gallery/outline.json` for an extension: where its column sits is the user's to drag, and Gallery keeps it there. When an extension's folder is gone (`gallery extension remove`, or deleted by hand), Gallery takes its columns' places out of that file as it starts and as it sees the folder go; a disabled extension keeps them.

## Columns a program writes (columns/)

When a program extension (one with `extension.json`) should show entries it fetches (a 语雀 knowledge base, a team's tickets), give it columns of its own rather than a second, sidebar-only extension: its backend writes `<column>.json` files, each in the format of sidebar.json above, in its folder's `columns/`. The backend gets that path as `GALLERY_EXTENSION_COLUMNS`; make the folder when it is missing. `<column>` is lowercase letters, digits and dashes (`wiki`, `team-notes`), 48 at most; other files there are ignored. Write a dot-named temporary file in the same folder and rename it over `<column>.json`, so that no one reads half a file.

- Each file is one column of the sidebar, shown while the extension is enabled and hidden while it is disabled. In Settings they are rows of the extension's detail (侧栏栏目 · <title> · <n> 个条目), not cards of their own; `gallery extension list` lists them under the extension (`--json`: its `columns`, each `{ id, title, count, file }`).
- A change in `columns/` updates the sidebar within a second and, unlike any other file of the extension, neither reloads its workbench script nor restarts its backend. `gallery extension install` keeps the installed `columns/` when it updates the extension; `gallery extension remove` deletes it with the rest.
- An entry's address is `#~<id>:<column>/<entry id>`. The user's renames, root reorders and deletions are written to that file: read it before rewriting it and keep those changes unless asked otherwise; a column the user deleted is not written again unless they ask.
- `gallery extension check <id>` prints each column as the sidebar shows it and fails when one does not read.
- A folder with only sidebar.json (no extension.json) stays a column of links: its `columns/` is not read.

## Installing and enabling executable extensions

Run `gallery extension install <folder | .zip>` to validate and install a complete extension in the default workspace. A ZIP may contain files at its root or inside one enclosing folder. The optional manifest `id` names the destination; otherwise the source folder/ZIP basename does. Replacement stages all files first and stops the old backend before swapping folders; the installed `columns/` (below) is kept as it is. `gallery extension remove <id>` stops its backend and removes its folder. These commands use the running Gallery service when available.

`gallery extension list` prints capabilities and the declared Agent instruction path; `gallery extension list --json` prints one object, `{ "folder": <the extensions folder>, "extensions": [...] }`, the folder even when there are none (where an installer puts one); each extension has its id, name, version, folder, enabled, error, column, backend, workbenchError and agent, and `settings` (its settings' values) when it declares any. When the user’s task relates to an extension, read that AGENT.md before acting. New installs are disabled by default. Use `gallery extension enable <id>`, `gallery extension disable <id>`, or `gallery extension install <folder | .zip> --enable` to set the switch. Updates retain it; a broken manifest can be disabled but not enabled. Extensions run with Gallery's permissions: enable trusted extensions. `gallery open --settings extensions --no-browser` prints the address of their settings, for the user. Backends start lazily on the first API request, stop when disabled/removed or Gallery exits, and restart after crashes with exponential backoff. A request to a disabled or removed extension, and one still in flight when it is disabled, is answered 403 `{ "reason": "disabled" }` (扩展已停用).

Example `extension.json` (all capability fields optional):

```json
{
  "id": "yuque-publish",
  "name": "语雀发布",
  "version": "1.0.0",
  "description": "发布文档到语雀",
  "icon": "📗",
  "workbench": { "script": "workbench.js", "style": "workbench.css" },
  "server": { "command": ["node", "server.mjs"], "timeout": 90000 },
  "agent": "AGENT.md",
  "settings": [
    { "key": "uniformLook", "type": "boolean", "label": "统一排版", "default": true, "help": "发布时统一标题、正文和表格的样式" }
  ]
}
```

The workbench script is an ES module that exports `activate(api)`. Gallery imports it only in the workbench, calls `activate` when the extension is enabled and again after each change of its files, and passes the only API there is: there is no global `window.gallery`. A script that exports no `activate` fails `gallery extension check` and shows in Settings as the extension's error, 工作台脚本需要导出 activate(api). `activate` may synchronously or asynchronously return a `dispose` function, called on disable or update. Scripts are served from a versioned address, `/__gallery/extensions/<id>/files/@revision/<revision>/<relative-path>`, so relative imports reload with them; paths cannot leave the extension directory or traverse symlinks. A cached module can be activated again after it is re-enabled.

- `api.slot('topbar-end')`: this extension's own container before the favorite button (also on custom pages). No topbar is added to online webpages.
- `api.slot('sidebar-footer')`: its own container above Settings.
- `api.onRoute(callback)`: immediately reports the current route, then changes; returns an unsubscribe function. Value: `{kind, ws, slug, link, title}`. `slug` is the owner-local folder name, `ws` the owner’s registry ID; `link` is the workbench URL.
- `await api.token()`: the token for authenticated API requests.
- `api.fetch(path, init)`: a request to this extension's backend (below), with the token added; returns the browser's `Response`. `api.backend` is the backend's address, an absolute URL ending in `/`.
- `api.settings`: the current values of the extension's settings (below), a frozen `{ key: value }` (`{}` with none). `api.onSettings(callback)`: immediately reports the values, then each change; returns an unsubscribe function.

Gallery removes the extension's slot containers and route listeners on disable even if no disposer is returned. Stable UI classes for extensions are `g-icon-btn`, `g-sidebar-row`, `g-switch`, `g-input`, `g-btn` and `g-btn primary`; `api.toast`, `api.confirm` and `api.menu` provide common workbench interactions. `data-tip` also works on extension elements.

Sidebar icons use `--sidIco` in both themes. Buttons with `g-icon-btn` inside `sidebar-footer` and icons in `g-sidebar-row` inherit this styling automatically; use `color: var(--sidIco)` for custom sidebar icon controls. Topbar buttons keep the normal workbench icon color.

For extension development, run `gallery sandbox --extension <directory> --demo` in a foreground terminal. Open its printed address, or pass `--open`. The sandbox installs a separate enabled copy and reinstalls it when the source changes, preserving the switch in Settings. Ctrl+C removes the sandbox; use `--keep` to inspect the copy afterward. `--from <workspace>` copies existing content. Use `gallery sandbox env <name>` in a separate shell to target the sandbox with CLI commands. Run only extensions you trust: backends have your local OS permissions.

A script returns cleanup for its own subscriptions or other effects:

```js
export function activate(api) {
  const button = document.createElement('button');
  button.className = 'g-btn primary';
  button.textContent = 'Publish';
  button.onclick = () => api.toast('Ready', { tone: 'info' });
  api.slot('topbar-end').append(button);
  const off = api.onRoute(route => { button.title = route.title; });
  return () => off(); // Gallery also removes this extension's slot containers
}
```

The API's other methods are `toast(message, { tone, action: { label, run } })`, `confirm({ title, message, actions, cancelId })` (returns the chosen action id) and `menu(anchor, entries)`. Confirmation actions have `{ id, label, primary?, danger? }`; menu entries have `{ label, onSelect?, danger?, disabled? }` or `{ kind: 'sep' }`. A switch uses `<span class="g-switch on"><span></span></span>` for its visual part. The settings link `#settings/extensions` opens the extension list and is consumed when opened.

The manifest's optional `name`, `version` and `description` appear in the list; `icon` is an emoji or a relative PNG, JPEG, WebP, GIF or SVG file inside the extension. The backend proxy times out after 30 seconds without socket activity by default. Set `server.timeout` to a whole number of milliseconds from 1000 to 600000 when a backend operation needs a longer idle interval; alternatively stream progress or heartbeats.

Use Gallery’s CSS variables: `--texPri`, `--texSec`, `--bacPri`, `--sidBac`, `--bacIntTra`, `--btnPriBg`, `--btnPriTex` (see the workbench theme for the full set). Do not select internal DOM class names. Slots retain their elements as pages change.

Backend commands run without a shell, with cwd set to the extension folder and the service’s environment and system permissions. `node` uses Gallery’s Node executable. Listen on `GALLERY_EXTENSION_HOST` (127.0.0.1) and `GALLERY_EXTENSION_PORT` (also `PORT`); `GALLERY_EXTENSION_ID` identifies the extension; `GALLERY_EXTENSION_COLUMNS` is its `columns/` folder (below); `GALLERY_EXTENSION_SETTINGS` is the file of its settings' values (below). Logs are `<data>/logs/extensions/<id>.log`. This internal port is managed by Gallery; users always use the one public Gallery address.

Gallery proxies `/__gallery/extensions/<id>/api/*` (`api.backend`) to the backend’s `/*`. Every request requires the Gallery token and same-origin browser context. In the workbench script, ask the backend with `api.fetch(path, init)`: `path` is the backend's own path (`'publish'` or `'/publish'`, a query too), `init` is `fetch`'s, and the token header is added; any other address (a scheme, `..` out of the backend) throws a `TypeError`. Never work the address out from `import.meta.url`: scripts are served from `files/@revision/<revision>/`, so `new URL('../api/', import.meta.url)` lands under `files/` (Gallery 0.2.4 moved them there). Gallery answers such a request 404 with `reason: "backend-address"` and the backend's address, and the extension's card in Settings shows the same message. Browser example, inside `activate(api)`:

```js
const response = await api.fetch('publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ link: location.href })
});
const answer = await response.json();
if (!response.ok) api.toast(answer.message ?? `${response.status}`, { tone: 'error' });
```

The browser supplies Origin for POST. For GET/HEAD, Gallery also accepts the same-origin Referer when Origin is absent; do not attempt to set these browser-controlled headers manually. Command-line clients pass both Origin and token. No CORS configuration is needed.

## Settings

When the user should be able to switch something of the extension on or off (统一排版 on publishing, a sync), declare it in `extension.json`'s `settings` (the example above) rather than building a panel: Gallery draws each one as a switch on the extension's detail in 设置 › 拓展列表, saves it and hands the value to the extension.

| Field | Rule |
| --- | --- |
| `key` | Required. Letters, digits and `_`, not starting with a digit, 64 characters at most; once in the list. Not a name every object has (`constructor`, `toString`…). Keep it for as long as the setting is the same: the saved value goes by it. |
| `type` | Required. Only `boolean` now; any other type makes `extension.json` unreadable (its error in Settings and in `gallery extension check`), so an older Gallery says so rather than passing it over. |
| `label` | Required, 1 to 100 characters: the switch's name. |
| `help` | Optional, 500 characters at most: one line under the label. |
| `default` | Optional, a value of its type (`false` when left out). |

At most 50 settings. The controls are greyed while the extension is disabled; the values stay. `gallery extension remove` (and 移除扩展… in Settings) deletes them with the extension.

- **Backend:** `GALLERY_EXTENSION_SETTINGS` is a JSON file `{ "<key>": value }` with every declared key, defaults filled in, written before the backend starts and atomically at each change. Read it each time a value is needed (`JSON.parse(fs.readFileSync(process.env.GALLERY_EXTENSION_SETTINGS, 'utf8'))`): a change does not restart the backend. Never write it; Gallery owns it.
- **Workbench script:** `api.settings` and `api.onSettings(callback)` (above). A change does not reload the script.
- **Command line:** `gallery extension settings <id>` prints each setting with its value and the file; `gallery extension settings <id> uniformLook=false` sets one as the switch does (`true`/`false`, `on`/`off`), refused while the extension is disabled; `--json` for a program. `gallery extension list --json` gives each extension's `settings` values.

A user's value equal to the default is not kept, so a default changed in a later version reaches those who never changed it. A key removed from `settings` drops its value; renaming a key starts it again from its default.

## Publishing a document on another platform

An extension that publishes a document elsewhere (语雀, a wiki) starts from its offline file, which `gallery export` makes: its backend, or the Agent as its AGENT.md says, runs the command and reads the file it names (its `Exported <path>` line, and its last line, `交给用户（…）：<path>`). Gallery hands an extension no export of its own.

- The file's policy lets it show only the pictures it holds (`data:` URLs) and reach no network but an embed's page. When the extension puts the pictures on the platform and writes their web addresses into the file, ask for those sources as you export: `gallery export <slug> --allow-images https://cdn.example.com --out <folder>`. A source is `https:` (any https address) or an origin, `https://*.example.com` for its subdomains, a port allowed and no path; several are separated by commas. Anything else is refused (exit 2). Under its `Exported` line the command says `network: its pictures may load from …`. Never rewrite the file's `<meta http-equiv="Content-Security-Policy">`: its text is no interface and may change in any version, and the pictures it then blocks show blank, which fetching their addresses with curl does not reveal; open the published page to see them.
- A platform that strips `<iframe>` (语雀 strips all of them) leaves an embed block blank: `--embeds-as-links` writes each as a card that links to the page it showed, its caption kept. An embedded file of the document has no address a reader elsewhere can open, and its card is its name.
- Either option implies `--format html`, and the file is held to the checks as the offline file is: a document they fail is not written, its `FAIL` lines say why, and the command exits 1 (`--allow-failures` exits 0, and writes none either). Publish only a file the command named. With `--out` the file is `<folder>/<slug>.html`; without it, `exports/<slug>-web.html` (`<slug>-web.zip` with `--subpages`), for `exports/<slug>.html` is always the offline file that reaches nothing.
- Pictures alone: video, audio and fonts stay inside the file.
- The file ends with two lines of data, each a `<script>` that does not run: the words its display menu copies, and the document as written, for an import of the file. A platform that keeps no script can drop both. Once the extension changes the file, an import of it brings back the page as it now is rather than that document.
