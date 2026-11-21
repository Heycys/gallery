import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Imported first by every unit test file that reaches src/shared/paths.mjs, so that the environment
// below is set before paths.mjs computes its paths at import, and a file run alone (node
// tests/unit/model.mjs) never resolves a workspace of its own (~/Documents/Gallery) nor reads the
// user's registry. Every child a test starts inherits GALLERY_WORKSPACE, GALLERY_NO_DEFAULT_HOME,
// GALLERY_NO_PACKS and GALLERY_DATA_DIR.
// No server or gallery init a unit test starts makes a default home page (src/editor/home-page.mjs) in
// its workspace (the default one below among them): the tests of the home page ask for one.
process.env.GALLERY_NO_DEFAULT_HOME ||= "1";
// Nor installs Gallery's own block packs (src/shared/block-packs.mjs installOfficialPacks): the tests of
// the packs ask for them (tests/unit/block-packs.mjs).
process.env.GALLERY_NO_PACKS ||= "1";
// The machine's registry of workspaces (src/shared/workspace-registry.mjs), which every command and
// server writes, is a folder of the tests' in the system's temporary folder, never the user's own
// (%LOCALAPPDATA%\gallery on Windows): the tests of the registry name folders of their own. One for each
// test file run (its children inherit it), taken away when it ends: every registered workspace is a
// column of every workspace's sidebar (src/shared/workspace-columns.mjs), so that one test file's, or a run
// beside it, would show in another's outline.
if (!process.env.GALLERY_DATA_DIR) {
  const data = path.join(os.tmpdir(), "gallery-unit-data", `${process.pid}-${Date.now().toString(36)}`);
  process.env.GALLERY_DATA_DIR = data;
  process.on("exit", () => {
    try {
      rmSync(data, { recursive: true, force: true });
    } catch {}
  });
}
// A document made or opened by gallery new or open in a workspace other than the default one joins the
// default workspace's sidebar (src/shared/drafts.mjs joinDefaultTree): never in a test (the default
// workspace is the user's ~/Documents/Gallery), but where a test of it says otherwise.
// Shared extensions are read from the default workspace even without its server. Keep that source
// isolated too, including commands that now create public extension columns there by default.
process.env.GALLERY_DEFAULT_WORKSPACE ||= path.join(process.env.GALLERY_DATA_DIR, "default-workspace");
// The workspace the unit tests read when a test names none: an empty folder in the same temporary data
// folder (made by whatever first writes it, taken away with the rest), so that no test reads or writes
// documents of the checkout. A test that needs documents makes a temporary workspace and names it
// (GALLERY_WORKSPACE for a child, or a service's reportsDirectory); the Component Catalog is read from
// tests/fixtures/component-catalog/.
process.env.GALLERY_WORKSPACE ||= path.join(process.env.GALLERY_DATA_DIR, "workspace");
// The words Gallery writes into files (a new document's starter section and description, the home page's
// title…) follow the system's language (src/shared/file-language.mjs): the tests read them in Chinese on any
// machine, and the tests of the English side say GALLERY_LANGUAGE=en themselves.
process.env.GALLERY_LANGUAGE = "zh";
// A web link added by a test asks no real site for its icon (src/editor/unfurl.mjs siteIcon): a test's own local site alone.
process.env.GALLERY_SITE_ICON ||= "local";
