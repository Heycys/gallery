// What the import builds (import/): block specs and rich text, the one form every source of pasted
// content is read into, whose conversions tests/unit/paste.mjs checks. to-blocks.mjs turns them into
// the page's blocks.
//
//   spec       { type, title, props, children }: its types are text, header, sub_header,
//              sub_sub_header, header_4, bulleted_list, numbered_list, to_do, quote, callout, toggle,
//              code, equation, divider, table + table_row, image, embed, file, column_list + column,
//              tab, and the kit's flowchart, report_flow + report_step (html.mjs); its props checked,
//              language, source, caption, block_color, icon, …
//   rich text  [[text, [[annotation, value?], …]], …] (inline.mjs names the annotations)

export const spec = (type, title = [], props = {}, children = []) => ({ type, title, props, children });

const annotationKey = (annotations) => JSON.stringify([...annotations].map((a) => JSON.stringify(a)).sort());

/** Rich text with neighbouring pieces of the same annotations joined and empty ones dropped. */
export function normalize(title) {
  const out = [];
  for (const [text, annotations] of title ?? []) {
    if (!text) continue;
    const last = out.at(-1);
    if (last && annotationKey(last[1] ?? []) === annotationKey(annotations ?? [])) last[0] += text;
    else out.push(annotations?.length ? [text, annotations] : [text]);
  }
  return out;
}

/** The plain text of rich text (a formula as its TeX). */
export const plainOf = (title) => (title ?? []).map(([text, annotations]) => annotations?.find((a) => a[0] === "e")?.[1] ?? text).join("");
