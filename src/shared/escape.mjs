// The one place a string is made safe to stand in markup, for the page, the server and the render
// side alike. A writer picks the set of characters its markup needs and has always written:
//   escapeText       & < >   text in an element
//   escapeAttribute  & "     a value in double quotes
//   escapeMarkup     & < > "  a string that lands in text or in an attribute
//   escapeTyped      & <     what a reader typed into a block: a bare > is as valid, and the file
//                            keeps the one an author wrote
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const replacing = (characters) => {
  const pattern = new RegExp(`[${characters}]`, "g");
  return (text) => text.replace(pattern, (character) => ENTITIES[character]);
};

export const escapeText = replacing("&<>");
export const escapeAttribute = replacing('&"');
export const escapeMarkup = replacing('&<>"');
export const escapeTyped = replacing("&<");

/** The text an escaped string reads as: what the page reads back from a source it holds. */
export const unescapeText = (text) => text.replace(/&(lt|gt|quot|#39|#93|#36|amp);/g, (_, name) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", "#93": "]", "#36": "$", amp: "&" })[name]);
