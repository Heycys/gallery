// 详情卡片 in report.html (the server's, source/): a detail card made on the page is written as
// the kit writes one: <dialog class="doc-dialog" id>, its panel and its blocks in .doc-dialog-content.
// It keeps the id its link opens it by: one the file does not use yet. It may hold no blocks.

export default {
  dialog: {
    empty: true,
    check(node, { usedIds }) {
      if (typeof node.id !== "string" || !/^[A-Za-z][\w-]{0,63}$/.test(node.id) || usedIds.has(node.id)) return false;
      usedIds.add(node.id);
      return true;
    },
    write(node, w) {
      // The kit's detail card: its blocks in the content region.
      const content = node.children.length > 0
        ? w.block('<div class="doc-dialog-content">', w.children(w.deep(3)), "</div>", w.deep(2), w.deep(3))
        : '<div class="doc-dialog-content"></div>';
      const panel = w.block('<div class="doc-dialog-panel">', [content], "</div>", w.deep(1), w.deep(2));
      return w.block(`<dialog class="doc-dialog" id="${node.id}">`, [panel], "</dialog>");
    },
  },
};
