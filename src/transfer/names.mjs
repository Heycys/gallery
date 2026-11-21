// How an export names what it writes: a page's file "<title>.<ext>", the title as it is with no id
// added (the user asked for the titles as they are), its subpages and its files in a folder named as
// it (or all at the top, flat); names cut to what every file system takes; a name made unique in its
// folder (case aside) as "image.png", "image 1.png"; links from one file to another relative, each
// segment percent-encoded, "(" and ")" too (a Markdown link's address breaks on them).

/** A title as a file name: no \ / : * ? " < > | or control characters, one space between words, 100 characters at most; "Untitled" for none. */
export function safeName(title) {
  const name = String(title ?? "").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100).trim();
  return name || "Untitled";
}

/** A name not yet taken in `taken` (a Set of lower-cased names, which gets it): "name.ext", else "name 1.ext", "name 2.ext"… */
export function uniqueName(name, taken) {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let number = 0; ; number += 1) {
    const candidate = number === 0 ? name : `${stem} ${number}${ext}`;
    if (!taken.has(candidate.toLowerCase())) {
      taken.add(candidate.toLowerCase());
      return candidate;
    }
  }
}

/** The link from the file at `from` to the one at `to` (zip paths), each segment percent-encoded, parentheses too. */
export function relativeLink(from, to) {
  const source = from.split("/").slice(0, -1);
  const target = to.split("/");
  let common = 0;
  while (common < source.length && common < target.length - 1 && source[common] === target[common]) common += 1;
  const steps = [...source.slice(common).map(() => ".."), ...target.slice(common)];
  return steps.map((step) => (step === ".." ? step : encodeURIComponent(step).replace(/\(/g, "%28").replace(/\)/g, "%29"))).join("/");
}
