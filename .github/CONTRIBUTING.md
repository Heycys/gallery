# Contributing to Gallery

Gallery is maintained by one person, so replies to issues and pull requests can take a while. Issues and pull requests are welcome in English or Chinese.

## What helps most now

- **Reports from setups that are not tested yet:** macOS, Linux, Safari, Firefox, a real Chinese input method. [Open an issue](https://github.com/heycys/gallery/issues/new/choose) with what you did and what you saw; the form asks for your OS, browser, Node.js and Gallery versions, how Gallery is installed, and the output of `gallery doctor`.
- **Small, focused fixes**, with a test that fails without them. For anything larger, open an issue first, so the approach is agreed before you spend time on it.

Please report security problems privately, as [SECURITY.md](SECURITY.md) describes, not in an issue.

## Running from source

You need Node.js 22.13 or newer and desktop Chrome or Edge: editing is supported in those two browsers, and `gallery qa` and the tests drive the installed one (`GALLERY_BROWSER=<its executable>` picks which).

The dev server works in the default workspace, `~/Documents/Gallery`, unless you tell it otherwise: on every start it prepares that workspace with this checkout's code (it creates it if missing, installs or updates Gallery's two built-in block packs and the home page, and records it in your user data folder), even when it then stops because the port is taken. So give it a workspace and a data folder of its own before the first start, and set the same two variables for `node src/cli/bin.mjs` in another terminal:

```bash
npm ci
# macOS, Linux, Git Bash
GALLERY_DEFAULT_WORKSPACE=~/gallery-dev/workspace GALLERY_DATA_DIR=~/gallery-dev/data npm run dev
# PowerShell
$env:GALLERY_DEFAULT_WORKSPACE="$HOME\gallery-dev\workspace"; $env:GALLERY_DATA_DIR="$HOME\gallery-dev\data"; npm run dev
```

`npm run dev` first builds the kit into `public/kit/` and `public/vendor/` (generated, not tracked), then serves the workbench at http://127.0.0.1:8080 and stops if that port is taken. If Gallery is also installed from npm and running (on Windows and macOS it starts at login), it holds port 8080: stop it with `gallery stop` first. `node src/cli/bin.mjs help` lists the commands, run from this checkout.

Without those variables or `--workspace <folder>`, commands from the checkout also work in `~/Documents/Gallery`, and `export` rewrites each document it exports in Gallery's form and gives its blocks ids. To try a change, `node src/cli/bin.mjs sandbox --name try --demo` starts a throwaway Gallery on a free port, with two sample documents and folders of its own; Ctrl+C stops it and removes them.

## Finding your way

Read [docs/internals.md](../docs/internals.md) ("Where things live") first, then the document of the system you are changing: [render.md](../docs/render.md), [editor.md](../docs/editor.md), [workbench.md](../docs/workbench.md) or [testing.md](../docs/testing.md). They are long; search them rather than reading them through (most topics are list items that start with a bold phrase). The user manual, [docs/manual.zh-CN.md](../docs/manual.zh-CN.md), is in Chinese for now; `gallery help` is in English.

## Before you open a pull request

There is no CI, so run the checks yourself and list the ones you ran in the pull request:

- the unit files that cover your change, each on its own: `node tests/unit/<file>.mjs`;
- the quick text checks: `node tests/unit/docs.mjs`, and the same for `skill-docs`, `i18n`, `boundaries`, `engine-names`, `components` and `package-files`;
- if you changed the editor, the local server, saving, the workbench or export: the browser scenarios that cover it, `node tests/browser/run.mjs <scenario> …` (one takes seconds; [docs/testing.md](../docs/testing.md) describes the scenarios of each area);
- if you changed how saving merges the two writers (the commit path): some fuzz runs, `npm run test:fuzz -- <first seed> <how many>`.

The full suites run before each release and are slow. `npm run kit:check` runs every unit file in turn and stops at the first that fails (`component-command.mjs` alone takes about 21 minutes). `npm run test:browser` takes over an hour; `node tests/browser/run.mjs --shards <N>` runs it in N parts at once. `npm run test:release` builds, packs and installs the npm package, then runs every command. Tests bound by time can fail on a busy machine: run a failing file alone once before calling it broken. Some tests already fail on main; they are listed under [Known failures](../docs/testing.md#known-failures), so a failure there is not yours.

When you change behaviour:

- Update the paragraph in `docs/` that describes it. A new unit test file is added to `tests/unit/run.mjs` and named in `docs/testing.md`; `docs.mjs` checks both.
- Interface text is written as `t("中文")`, with its English in `src/shared/i18n/en.mjs`; `i18n.mjs` checks that every string has both. If you don't write Chinese, say so in the pull request.
- Keep one change per pull request, and say what behaviour changed, why, and how you tested it.

Contributions are accepted under the project's [MIT License](../LICENSE).
