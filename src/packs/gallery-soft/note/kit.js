// gallery-soft/note (便签, 柔光风格): Gallery 风格's gallery/note in the soft look, the same logic. A few lines
// of free text, kept in the instance's data part, a script of JSON, { "text": "…" }, and typed on the card
// itself, in a <textarea> the block draws. The field is the kit's (DocKit.input): what the reader typed goes
// to the file once they are done with it, as they leave the field or press Ctrl+Enter (⌘Enter on a Mac;
// Enter alone is a new line), never while an input method composes, and never a value it holds already; Esc
// puts back what the file holds. Each of those is one context.editJSON, one undo step, the JSON written
// back on one line as it was. It draws from the part on every `source` (an Agent's write, an undo), the
// words the reader is typing kept where they are. Where nothing takes its writes (an export, a page that
// has not come to edit yet: context.canEdit() false) the field is read-only, and shows the same words.
//
// Its face is a sheet of paper (the paper's warm fill, faint ruled lines the words sit on): a head (the
// chip, a note's picture in the warm color, 便签, and how many characters it holds, its blanks not
// counted, said again as the reader types), the field under it, and while the reader types in it a line
// at the bottom saying how to keep and how to drop what they typed (Ctrl+Enter 保存, Esc 放弃). An empty
// note says 写点什么, on a wide card with an example of what (比如今天要记住的事). Laid out by its card's size
// (`context.size`, read again on `layout`; the face's data-w, data-h and data-pad, style.css).

const WORDS = {
  zh: {
    empty: "写点什么",
    emptyWide: "写点什么，比如今天要记住的事",
    label: "便签",
    count: (/** @type {number} */ count) => `${count} 字`,
    keep: (/** @type {boolean} */ mac) => `${mac ? "⌘" : "Ctrl+"}Enter 保存`,
    drop: "Esc 放弃",
  },
  en: {
    empty: "Write something",
    emptyWide: "Write something to remember today",
    label: "Note",
    count: (/** @type {number} */ count) => `${count} ${count === 1 ? "character" : "characters"}`,
    keep: (/** @type {boolean} */ mac) => `${mac ? "⌘" : "Ctrl+"}Enter to keep`,
    drop: "Esc to drop",
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * The words a note's data holds (context.readJSON's): its `text`, "" where it has none yet; throws
 * saying why for data that is no note, which the block does not draw over.
 * @param {any} data
 * @returns {string}
 */
function textOf(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("its data is no object: a note holds { \"text\": \"…\" }");
  if (data.text === undefined) return "";
  if (typeof data.text !== "string") throw new Error("its text is no string");
  return data.text;
}

/**
 * The note made to hold `text`, one write (context.editJSON): what a reader's words, once they are done
 * with the field, call, and the example too. Whether it was taken.
 * @param {DocComponentContext} context
 * @param {string} text
 */
function writeNote(context, text) {
  return context.editJSON("note", (data) => {
    textOf(data);
    data.text = text;
  });
}

/** How many characters `text` holds, its blanks not counted (the head's count). @param {string} text */
const countOf = (text) => [...text.replace(/\s+/g, "")].length;

/**
 * The size the face is laid out by: its card's cells (`context.size`), or `fallback` (the manifest's first
 * size) where no card is; and the frame's padding for it, as the soft cards pad theirs: "xs" on a card one
 * cell high, "s" on a small one (2 × 2 and less), "l" on one 3 cells high or more, else "m".
 * @param {DocComponentSize | null | undefined} size
 * @param {[number, number]} fallback
 */
function sizeOf(size, fallback) {
  const w = size?.w ?? fallback[0];
  const h = size?.h ?? fallback[1];
  return { w, h, pad: h === 1 ? "xs" : w <= 2 && h <= 2 ? "s" : h >= 3 ? "l" : "m" };
}

DocKit.component({
  id: "gallery-soft/note",
  on: ["source", "editable", "layout"],
  mount(host, context) {
    const words = WORDS[languageOf(document.documentElement)];
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const face = document.createElement("div");
    face.className = "gallery-soft-note-face";
    const head = document.createElement("div");
    head.className = "gallery-soft-note-head";
    head.setAttribute("aria-hidden", "true");
    const chip = document.createElement("span");
    chip.className = "gallery-soft-note-chip";
    chip.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.25h9a2.25 2.25 0 0 1 2.25 2.25v5.9c0 .6-.24 1.17-.66 1.6l-3.1 3.09c-.42.42-1 .66-1.59.66H5.5a2.25 2.25 0 0 1-2.25-2.25v-9A2.25 2.25 0 0 1 5.5 3.25z"/><path d="M16.6 11.75h-3.1a1.75 1.75 0 0 0-1.75 1.75v3.1"/></svg>'; // a note with its corner turned, on a 20 grid, its line the 1.8 of the others' 24 in proportion
    const title = document.createElement("span");
    title.className = "gallery-soft-note-title";
    title.textContent = words.label;
    // Its quiet meta at the head's end: how many characters the field holds (its blanks not counted), as the reader types too.
    const meta = document.createElement("span");
    meta.className = "gallery-soft-note-meta";
    head.append(chip, title, meta);
    const field = document.createElement("textarea");
    field.className = "gallery-soft-note-field";
    field.spellcheck = false;
    field.setAttribute("aria-label", words.label);
    // While the reader types: how to keep and how to drop it.
    const hint = document.createElement("div");
    hint.className = "gallery-soft-note-hint";
    hint.setAttribute("aria-hidden", "true");
    const keep = document.createElement("span");
    keep.textContent = words.keep(mac);
    const drop = document.createElement("span");
    drop.textContent = words.drop;
    hint.append(keep, drop);
    face.append(head, field, hint);
    host.append(face);
    const typed = DocKit.input(field, { signal: context.signal, commit: (value) => writeNote(context, value) });
    const recount = () => {
      const count = countOf(field.value);
      const said = count > 0 ? words.count(count) : "";
      if (meta.textContent !== said) meta.textContent = said;
    };
    field.addEventListener("input", recount);
    context.signal?.addEventListener("abort", () => field.removeEventListener("input", recount), { once: true });
    const lay = () => {
      const { w, h, pad } = sizeOf(context.size, [4, 2]);
      face.dataset.w = String(w);
      face.dataset.h = String(h);
      face.dataset.pad = pad;
      const placeholder = w <= 2 ? words.empty : words.emptyWide;
      if (field.placeholder !== placeholder) field.placeholder = placeholder;
    };
    const draw = () => {
      const data = context.readJSON("note");
      if (data === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      let text;
      try {
        text = textOf(data);
      } catch (error) {
        return context.fail(error);
      }
      field.readOnly = !context.canEdit();
      typed.set(text);
      recount();
    };
    lay();
    draw();
    return {
      update(reason) {
        if (reason === "layout") lay();
        else draw();
      },
    };
  },
  example(host, context) {
    writeNote(context, `${textOf(context.readJSON("note"))}\n再加一行`);
  },
});
