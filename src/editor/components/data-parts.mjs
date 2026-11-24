import { DATA_MOST, fitsDataScript, isDataScript, noDataPart, refusedInData } from "../../shared/components/installed.mjs";

// What a component's drawing writes to the parts of its block that it edits as data (an instance of a
// component package: installed/page.mjs; a database: database/page.mjs), as the page takes it: the kit
// asks by doc-component-edit ({ parts, run }: the parts it names, by name, and its change, handed a draft
// of each), and the page gives it drafts, off the page, checks what it made of them as the server would,
// and puts copies of them in. One rule for every block that writes so; the undo step and the commit are
// the caller's (a `source` step: history.mjs sourceStep; core.mjs dataChanges, on its page object's dataOf).
//
// The check is the same whatever the size of a part, but not its cost: a part whose inside is known to
// pass (checked whole here, or put in by a write that was checked: `passed`) and whose draft differs from
// it only in rows of a table's sections (a database's cell typed, a record added) is checked in those rows
// alone, read back in the place they stand (changedRows, rowsProblem), every other row being the part's
// own that passed already, and only those rows go into the part on the page; any other change (a section,
// a caption, words standing in the table itself) is checked whole, as is a part not known to pass, and a
// script of data is read on every write.

// All an element holds, what a <template> keeps apart among it.
const allIn = (root) => [...root.querySelectorAll("*")].flatMap((node) => (node.localName === "template" ? [node, ...allIn(node.content)] : [node]));
// A node and all it holds, as allIn finds them in what holds it: the elements alone.
const selfAndAllIn = (node) => (node.nodeType !== 1 ? [] : node.localName === "template" ? [node, ...allIn(node.content), ...allIn(node)] : [node, ...allIn(node)]);
// An element's own tag and attributes as markup.
const ownTag = (node) => node.cloneNode(false).outerHTML;

// What each says where a draft cannot go in.
const SAID = {
  own: "a part's own tag and attributes are the file's: a change writes what it holds",
  most: `it holds more than the ${DATA_MOST} bytes one commit writes`,
  mostTogether: `together they hold more than the ${DATA_MOST} bytes one commit writes`,
  script: "a script of data holds JSON, with nothing in it that ends a script: write < as \\u003c",
  noPart: (tag) => `a <${tag}> is no part a component can write`,
  readBack: "what it holds does not read back as itself (a row with no tbody, a block in a paragraph): a file would hold something else",
  refused: (tag) => `a data part holds no <${tag}> of that kind: no script, handler, frame, address of code, data-block-id or data-ge-*`,
};

/** Whether markup is more than one commit writes in UTF-8 (DATA_MOST): a UTF-16 unit is one to three bytes of it, so its length alone says so but near the limit. */
export function tooLong(html) {
  if (html.length * 3 <= DATA_MOST) return false;
  return html.length > DATA_MOST || new TextEncoder().encode(html).length > DATA_MOST;
}

/**
 * Why what a component made of `draft`, a draft of `part`, cannot go in, checked whole (all it holds read
 * back, every element of it looked at), as the server would say (installed/file.mjs and database/file.mjs
 * `rewrite`), for who writes the component, or null. `html`: the draft's inside, where the caller has it;
 * `size` false where the caller counts the bytes itself (the parts of one write together: draftedParts).
 */
export function wholeProblem(part, draft, html = draft.innerHTML, { size = true } = {}) {
  if (ownTag(draft) !== ownTag(part)) return SAID.own;
  if (size && tooLong(html)) return SAID.most;
  if (part.localName === "script") return isDataScript(part.localName, [...part.attributes]) && fitsDataScript(html) ? null : SAID.script;
  if (noDataPart(part.localName)) return SAID.noPart(part.localName);
  const read = part.cloneNode(false);
  read.innerHTML = html;
  if (read.innerHTML !== html) return SAID.readBack;
  const refused = allIn(draft).find((node) => refusedInData(node.localName, [...node.attributes]));
  return refused ? SAID.refused(refused.localName) : null;
}

/**
 * Where `draft` differs from `part` (a <table> and its draft, of the same tag and attributes), when it is
 * in the rows of its sections alone: for each section that differs, `{ at, from, to, upTo }`, its place
 * among the table's child nodes and the run of its child nodes the draft has anew (`from` to `to`; in the
 * part `from` to `upTo`); the nodes around them, and every other child of the table, are the same as the
 * part's (isEqualNode). Null where anything else differs: the table's own children (a section added or
 * taken out, a caption, words or blanks between them) or a section's own tag and attributes.
 */
export function changedRows(part, draft) {
  if (part.localName !== "table" || draft.localName !== "table") return null;
  const old = part.childNodes;
  const now = draft.childNodes;
  if (old.length !== now.length) return null;
  const spans = [];
  for (let at = 0; at < now.length; at++) {
    const was = old[at];
    const is = now[at];
    if (is.isEqualNode(was)) continue;
    if (is.nodeType !== 1 || was.nodeType !== 1 || !/^(?:thead|tbody|tfoot)$/.test(is.localName) || ownTag(is) !== ownTag(was)) return null;
    const a = was.childNodes;
    const b = is.childNodes;
    let from = 0;
    while (from < a.length && from < b.length && a[from].isEqualNode(b[from])) from++;
    let end = 0;
    while (end < a.length - from && end < b.length - from && a[a.length - 1 - end].isEqualNode(b[b.length - 1 - end])) end++;
    spans.push({ at, from, to: b.length - end, upTo: a.length - end });
  }
  return spans;
}

/**
 * Why rows a draft has anew (`spans` of changedRows) cannot go in, as wholeProblem would say of the whole
 * draft where everything else in it is known to pass: each run read back in its section, in its table
 * (where a parser reads it: what stands before a row in such a table, having read back as itself, leaves
 * the parser as it finds it at a row), then every element in them looked at; or null.
 */
export function rowsProblem(part, draft, spans) {
  const runs = spans.filter(({ from, to }) => to > from).map(({ at, from, to }) => {
    const holder = draft.childNodes[at].cloneNode(false);
    holder.append(...[...draft.childNodes[at].childNodes].slice(from, to).map((node) => node.cloneNode(true)));
    return holder;
  });
  for (const holder of runs) {
    const markup = holder.outerHTML;
    const read = part.cloneNode(false);
    read.innerHTML = markup;
    if (read.innerHTML !== markup) return SAID.readBack;
  }
  for (const holder of runs) {
    const refused = [...holder.childNodes].flatMap(selfAndAllIn).find((node) => refusedInData(node.localName, [...node.attributes]));
    if (refused) return SAID.refused(refused.localName);
  }
  return null;
}

/**
 * Why what a component made of a draft of `part` cannot go in, as the server would say (installed/file.mjs
 * and database/file.mjs `rewrite`), for who writes the component, or null: wholeProblem's answer, found in
 * the rows it changed alone where `known` (what the part holds is known to pass: then `spans`, where they
 * are, says which rows) and it changed only rows of a table. `html`: the draft's inside, where the caller
 * has it; `size` false where the caller counts the bytes itself.
 */
export function draftProblem(part, draft, { known = false, html = draft.innerHTML, spans = known ? changedRows(part, draft) : null, size = true } = {}) {
  if (!known || !spans) return wholeProblem(part, draft, html, { size });
  if (ownTag(draft) !== ownTag(part)) return SAID.own;
  if (size && tooLong(html)) return SAID.most;
  return rowsProblem(part, draft, spans);
}

// What each part held when it was last known to pass: checked whole here, or put in by a write that was
// checked (draftProblem's `known`). Any other change of it (an undo, someone else's write) leaves it
// holding something else, which is checked whole again at the next write.
const passed = new WeakMap();

/**
 * What a component asks to write (`{ parts, run }`) on `host`, the block whose parts they are (`id`: what
 * the console calls its component): { changed, put } where it can go in, `changed` the parts it changes
 * as [part, what it held, its draft, its name] and `put()` writing them (copies of the drafts go in, so
 * that a draft the component keeps reaches nothing on the page: of a part whose rows alone changed, those
 * rows, the rest of it staying as it is), then `written(changed)`, what the caller marks of it; null where
 * it is refused, said on the console: the change threw, wrote a part on the page rather than the draft it
 * was handed (put back: its step would undo the change it left out), or made what the file could not hold
 * (draftProblem). `together`: the bytes one commit writes (DATA_MOST) are of all the parts it names
 * together, as the server counts a database's write (database/file.mjs `rewrite`), rather than of each.
 */
export function draftedParts({ parts, run }, host, id, written = () => {}, { together = false } = {}) {
  const refuse = (problem) => {
    console.error(`[DocKit] ${id}: context.edit: ${problem}`);
    return null;
  };
  if (!Array.isArray(parts) || typeof run !== "function" || !parts.every(({ part }) => part?.nodeType === 1 && host.contains(part))) return refuse("it names no part of its own");
  const before = parts.map(({ part }) => part.innerHTML);
  const drafts = parts.map(({ part }) => part.cloneNode(true));
  const ran = run(Object.fromEntries(parts.map(({ name }, index) => [name, drafts[index]])));
  const live = parts.findIndex(({ part }, index) => part.innerHTML !== before[index]);
  if (live >= 0) {
    parts.forEach(({ part }, index) => { if (part.innerHTML !== before[index]) part.innerHTML = before[index]; });
    return refuse(`it wrote the part ${parts[live].name} on the page: a change writes the draft it is handed, which goes onto the page when it returns`);
  }
  if (!ran) return null;
  const htmls = drafts.map((draft) => draft.innerHTML);
  if (together && tooLong(htmls.join(""))) return refuse(`${parts.map(({ name }) => name).join(", ")}: ${SAID.mostTogether}`);
  const spans = [];
  for (const [index, { name, part }] of parts.entries()) {
    const draft = drafts[index];
    const html = htmls[index];
    const known = passed.get(part) === before[index];
    const same = html === before[index];
    spans.push(known && !same ? changedRows(part, draft) : null);
    // A part known to pass that its draft leaves as it was passes again; a script of data is read every time.
    const problem = known && same && part.localName !== "script" && ownTag(draft) === ownTag(part) ? null : draftProblem(part, draft, { known, html, spans: spans[index], size: !together });
    if (problem) return refuse(parts.length > 1 ? `${name}: ${problem}` : problem);
    // A draft holding what the part does passed for both: the part is known to pass now.
    if (same) passed.set(part, html);
  }
  const indexOf = new Map(parts.map(({ part }, index) => [part, index]));
  const changed = parts.map(({ name, part }, index) => [part, before[index], drafts[index], name]).filter(([, was], index) => htmls[index] !== was);
  return {
    changed,
    put() {
      if (changed.length === 0) return;
      for (const [part, was, draft] of changed) {
        const html = htmls[indexOf.get(part)];
        const rows = spans[indexOf.get(part)];
        // The rows it changed alone, where the part still holds what the draft was made of (it holds the
        // draft's markup then, which is looked at once more); else all of it.
        let done = false;
        if (rows && part.innerHTML === was && part.childNodes.length === draft.childNodes.length) {
          for (const { at, from, to, upTo } of rows) {
            const section = part.childNodes[at];
            const gone = [...section.childNodes].slice(from, upTo);
            const next = section.childNodes[upTo] ?? null;
            section.insertBefore(fragmentOf(part.ownerDocument, [...draft.childNodes[at].childNodes].slice(from, to)), next);
            for (const node of gone) node.remove();
          }
          done = part.innerHTML === html;
        }
        if (!done) part.replaceChildren(...draft.cloneNode(true).childNodes);
        passed.set(part, html);
      }
      written(changed);
    },
  };
}

// Copies of nodes, together, of `doc`.
function fragmentOf(doc, nodes) {
  const fragment = doc.createDocumentFragment();
  for (const node of nodes) fragment.append(node.cloneNode(true));
  return fragment;
}
