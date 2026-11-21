// What the workbench shows as 收藏 when it reads the list again (pure, so that the page imports it; the file side is ./favorites.mjs).
// The browser keeps its own list (localStorage) and the user's data folder keeps one that gallery favorite and every browser share: `local`
// is the browser's, `seen` what the shared list held when this browser last read it, `server` what it holds now. A three-way merge: an
// entry the shared list dropped since (in `seen`, not in `server`) leaves the browser's; one it gained since (in `server`, not in `seen`)
// joins it; one the browser took out since (in `seen` and `server`, not in `local`) stays out and is for the shared list to drop (`drop`:
// a read that lands while the browser's own removal is on its way never brings the star back); one only the browser has is for the
// shared list to take (`push`). The browser's order stays, the shared list's new entries last.
export function mergeFavorites({ local, seen, server }) {
  const gone = new Set(seen.filter((key) => !server.includes(key)));
  const own = local.filter((key) => !gone.has(key));
  const gained = server.filter((key) => !seen.includes(key) && !own.includes(key));
  return {
    favorites: [...own, ...gained],
    push: own.filter((key) => !server.includes(key)),
    drop: server.filter((key) => seen.includes(key) && !local.includes(key)),
  };
}
