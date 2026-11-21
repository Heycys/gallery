import { MEDIA_CLASS } from "../../../shared/components/index.mjs";

// What the four media blocks' writers (each component's file.mjs, the server's: source/) share when
// a new block is written into report.html.

/** A media block `id` left empty (the page editor's placeholder): an empty figure, shown to no reader. */
export const emptyFigure = (id, w) => `<figure class="${MEDIA_CLASS[id]}"${w.id}></figure>`;
