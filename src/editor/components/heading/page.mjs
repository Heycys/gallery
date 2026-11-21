// 标题 on the page: Ctrl/⌘+Enter in its words folds or unfolds its section; the fold itself, its
// triangle and what goes with a folded heading are page/fold/.

export function create(ctx) {
  return { keys: { commandEnter: ({ host }) => ctx.blocks()?.folds.toggle(host) ?? false } };
}
