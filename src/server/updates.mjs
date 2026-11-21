// Pages someone else wrote (docs/render.md "Live preview", the workbench's `updated <key>`; docs/workbench.md
// "Updated elsewhere"): a document's doc.html or a custom page's page.html whose text the server took
// changed, and not by the reader (the edit service's own write as the reader's, a commit of any page, a
// rename, an icon; the page service's write of a gesture on the page, or Gallery's own), is told the
// workbench, which marks its row in the sidebar until the reader opens it. An Agent's Write or Edit of
// the file, a gallery command, any other program: anyone else's.
//
// What it compares with is the text it last heard of each (`heard`: its version, a hash), seeded as the
// server starts with what it took of each file then (`seed`), so that a write of doc.json alone (a
// rename, a look) or a file told again unchanged is no update. A page heard first that was not there as
// the server started is new (made by gallery new, the workbench's 新建, an import, a copy, one back from
// the trash): no update, whoever made it, but the next write that changes it is one. One that was there
// (`know`) but not seeded yet (the start's take of it still under way) is an update when heard. Gone
// (null), it is forgotten: one that comes back is new.

/**
 * `tell(key)`: a page someone else wrote (`key` the slug of a document, `@<slug>` of a custom page).
 *   know(keys)                   the pages there as the server starts
 *   seed(key, version)           what the server took of one as it started (none heard since)
 *   heard(key, version, own)     the server took its file now (`version` its text's hash, null: gone),
 *                                `own` true for the reader's or Gallery's own write; whether it was told
 */
export function createUpdates(tell) {
  const heard = new Map(); // key -> the version last heard
  const known = new Set(); // there as the server started, not heard yet
  return {
    know(keys) {
      for (const key of keys) if (!heard.has(key)) known.add(key);
    },
    seed(key, version) {
      if (typeof version !== "string" || heard.has(key)) return;
      heard.set(key, version);
      known.delete(key);
    },
    heard(key, version, own) {
      if (typeof version !== "string") {
        heard.delete(key);
        known.delete(key);
        return false;
      }
      const before = heard.get(key);
      heard.set(key, version);
      const changed = before === undefined ? known.has(key) : before !== version;
      known.delete(key);
      if (!changed || own) return false;
      tell(key);
      return true;
    },
  };
}
