// An embedded PDF (an embed block's file, held by an export as a data: address) shown through a
// blob: address, which the browser's own PDF viewer opens in a frame where a data: one is refused.
// The file keeps the data: address: an export of the current view writes it back (dehydrate), and
// the blob: one goes when the block leaves the page.

const sources = new Map(); // blob: address -> the data: address it shows

/** An embed block's frame, a PDF's data: address shown as a blob: one; null for any other. */
export function showEmbed(figure) {
  const frame = figure.querySelector(":scope > iframe.doc-embed-frame");
  const source = frame?.getAttribute("src") ?? "";
  const match = /^data:application\/pdf;base64,([\s\S]*)$/.exec(source);
  if (!match) return null;
  const text = atob(match[1]);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  sources.set(url, source);
  frame.setAttribute("data-doc-blob", "");
  frame.src = url;
  return {
    destroy() {
      sources.delete(url);
      URL.revokeObjectURL(url);
      frame.removeAttribute("data-doc-blob");
      frame.setAttribute("src", source);
    },
  };
}

/** A copy of an embed block (an export of the current view): its PDF's data: address back. */
export function dehydrateEmbed(figure) {
  const frame = figure.querySelector(":scope > iframe.doc-embed-frame[data-doc-blob]");
  const source = frame && sources.get(frame.getAttribute("src"));
  if (!source) return;
  frame.setAttribute("src", source);
  frame.removeAttribute("data-doc-blob");
}
