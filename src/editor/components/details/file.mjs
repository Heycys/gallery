// 折叠列表 in report.html (the server's, source/): a disclosure made on the page is written as the
// kit writes one, closed: <details class="doc-details"><summary><span
// class="doc-details-summary-label">title</span></summary><div class="doc-details-content">
// its blocks, one indentation step deeper</div></details>, its background color (one pasted with
// it) a class after doc-details. It has a title and may hold no blocks.

export default {
  details: {
    empty: true,
    // Its title: inline text, as a summary label takes it, or none.
    check: (node, { validLeaf }) => node.title === "" || validLeaf({ tag: "span" }, node.title),
    write(node, w) {
      // Its blocks go in the content region, one step deeper; it opens closed, as the kit's disclosures do.
      const deeper = w.inner === null ? null : w.inner + w.step;
      const content = w.block('<div class="doc-details-content">', w.children(deeper), "</div>", w.inner, deeper);
      const color = node.classes?.length ? ` ${node.classes.join(" ")}` : ""; // its background, checked by the caller
      return w.block(`<details class="doc-details${color}"${w.id}>`,[`<summary><span class="doc-details-summary-label">${node.title}</span></summary>`, node.children.length > 0 ? content : '<div class="doc-details-content"></div>'], "</details>");
    },
  },
};
