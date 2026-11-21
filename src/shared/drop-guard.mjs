// A drag from outside a page of Gallery's (files of this computer, a link or a picture of another page)
// let go where nothing of the page takes it: the browser opens what it carries in a tab of its own (the
// file, the link's page), and the reader is taken away from the workbench, a presentation or a document.
// guardDrops(window) stops that, for the workbench (src/workbench/app/main.tsx) and every page the server
// serves of a document or a custom page (src/server/routes.mjs, as an inline script: it names nothing
// outside itself). Where a part of the page took the drag (a drop zone of its own, the editor's blocks:
// editor/page/drop-in/, `defaultPrevented` by then), it is theirs; elsewhere it is refused (no drop, the
// pointer saying so). Words and links dragged into a field that takes text stay the field's, as ever.
export function guardDrops(win) {
  const refuse = (event) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    const files = types.includes("Files");
    if (event.defaultPrevented || (!files && !types.includes("text/uri-list"))) return;
    const target = event.target;
    if (!files && (target?.isContentEditable || /^(input|textarea)$/i.test(target?.localName ?? ""))) return;
    event.preventDefault();
    if (event.type !== "drop") event.dataTransfer.dropEffect = "none";
  };
  for (const type of ["dragenter", "dragover", "drop"]) win.addEventListener(type, refuse);
}
