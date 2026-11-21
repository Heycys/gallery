// gallery/note (便签): a few lines of free text, kept in the instance's data part, a script of JSON,
// { "text": "…" }, and typed on the card itself, in a <textarea> the block draws under its head.
// The field is the kit's (DocKit.input): what the reader typed goes to the file once they are done with
// it, as they leave the field or press Ctrl+Enter (⌘Enter on a Mac; Enter alone is a new line), never
// while an input method composes, and never a value it holds already; Esc puts back what the file holds.
// Each of those is one context.editJSON, one undo step, the JSON written back on one line as it was. It
// draws from the part on every `source` (an Agent's write, an undo), the words the reader is typing kept
// where they are. Where nothing takes its writes (an export, a page that has not come to edit yet:
// context.canEdit() false) the field is read-only, and shows the same words. An empty note says 写点什么….
// Above the field its head (in the kit's card tokens): the chip, a note, its name,
// 便签, and its quiet meta after it, how many characters the field holds (its blanks not counted, said
// again as the reader types; none on a card two cells wide, `data-layout` "narrow" by context.size, read
// again on `layout`). Its lines are ruled faintly, a hint that it takes writing (style.css); while the
// reader types, a line under the field says the two keys (Ctrl+Enter 保存, Esc 还原; ⌘Enter on a Mac), and
// the card is ringed in the accent's wash; scrolled down, the field's top fades (data-scrolled). Nothing of
// the head or the foot is written.

const WORDS = {
  zh: { empty: "写点什么…", label: "便签", count: (/** @type {number} */ count) => `${count} 字`, save: "保存", undo: "还原" },
  en: { empty: "Write something…", label: "Note", count: (/** @type {number} */ count) => `${count} ${count === 1 ? "character" : "characters"}`, save: "save", undo: "revert" },
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

/** How many characters `text` holds, its blanks (spaces, new lines) not counted. @param {string} text */
const countOf = (text) => [...text.replace(/\s+/g, "")].length;

DocKit.component({
  id: "gallery/note",
  on: ["source", "editable", "layout"],
  mount(host, context) {
    const words = WORDS[languageOf(document.documentElement)];
    const head = document.createElement("div");
    head.className = "gallery-note-head";
    head.setAttribute("aria-hidden", "true");
    const chip = document.createElement("span");
    chip.className = "gallery-note-chip";
    chip.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.58" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.25h9a2.25 2.25 0 0 1 2.25 2.25v5.9c0 .6-.24 1.17-.66 1.6l-3.1 3.09c-.42.42-1 .66-1.59.66H5.5a2.25 2.25 0 0 1-2.25-2.25v-9A2.25 2.25 0 0 1 5.5 3.25z"/><path d="M16.6 11.75h-3.1a1.75 1.75 0 0 0-1.75 1.75v3.1"/></svg>'; // a note with its corner turned, on a 20 grid, its line the 1.9 of the others' 24 in proportion
    const title = document.createElement("span");
    title.className = "gallery-note-title";
    title.textContent = words.label;
    // Its quiet meta after the title: how many characters the field holds (its blanks not counted), as the reader types too.
    const meta = document.createElement("span");
    meta.className = "gallery-note-meta";
    head.append(chip, title, meta);
    const field = document.createElement("textarea");
    field.className = "gallery-note-field";
    field.placeholder = words.empty;
    field.spellcheck = false;
    field.setAttribute("aria-label", words.label);
    // While the reader types: the two keys, Ctrl+Enter (⌘Enter on a Mac) and Esc.
    const foot = document.createElement("div");
    foot.className = "gallery-note-foot";
    foot.setAttribute("aria-hidden", "true");
    const key = (/** @type {string} */ name, /** @type {string} */ does) => {
      const said = document.createElement("span");
      const bold = document.createElement("b");
      bold.textContent = name;
      said.append(bold, ` ${does}`);
      return said;
    };
    foot.append(key(document.documentElement.dataset.docPlatform === "mac" ? "⌘Enter" : "Ctrl+Enter", words.save), key("Esc", words.undo));
    host.append(head, field, foot);
    const typed = DocKit.input(field, { signal: context.signal, commit: (value) => writeNote(context, value) });
    const recount = () => {
      const count = countOf(field.value);
      const said = count > 0 ? words.count(count) : "";
      if (meta.textContent !== said) meta.textContent = said;
    };
    field.addEventListener("input", recount);
    context.signal?.addEventListener("abort", () => field.removeEventListener("input", recount), { once: true });
    // Scrolled down, its top fades (style.css), so that a line it scrolled past is never cut hard.
    const scrolled = () => field.toggleAttribute("data-scrolled", field.scrollTop > 0);
    field.addEventListener("scroll", scrolled, { passive: true });
    context.signal?.addEventListener("abort", () => field.removeEventListener("scroll", scrolled), { once: true });
    const draw = (/** @type {string} */ reason = "") => {
      const layout = context.size && context.size.w <= 2 ? "narrow" : "wide";
      if (head.dataset.layout !== layout) head.dataset.layout = layout;
      if (reason === "layout") return;
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
      scrolled();
    };
    draw();
    return { update: draw };
  },
  example(host, context) {
    writeNote(context, `${textOf(context.readJSON("note"))}\n再加一行`);
  },
});
