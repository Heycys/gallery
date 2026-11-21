// What gallery block new writes (./component.mjs): a package that passes gallery block check
// as it stands, its words for its writer to replace. A static block is its manifest, template, example,
// writing.md and style, no script: kit.js comes with --script alone. With --flow its text paragraph is
// a slot instead, body (data-doc-slot="body", a part edited as flow), where a document writes blocks of
// its own: a paragraph in the template, a paragraph and a list in the example. With --data the block
// keeps what a reader enters in a part of JSON (items: a list of lines, a field that adds one and a button
// that takes one away): a kit.js (so --script is implied) written with context.readJSON, context.editJSON
// and DocKit.input, whose example() adds an item (which works on template.html's empty instance as it
// does on example.html's), and whose controls are drawn only while context.canEdit() and hidden by the
// hidden attribute, as an export needs. With --page the block is a custom page's card (places ["page"],
// a card of two sizes the user may resize), its title and text parts edited as none, which a page shows as
// written: a page makes no text part editable, and holds no slot, so --page and --flow do not go together.
// An id and a name are of a few plain characters, safe as they are in each of these files. The instance
// carries no class, nor does its slot: a package's name may start with doc-, the kit's, and the
// instance's own attribute is what its style starts at; what its script draws stands in one node of a
// class every block shares (component-drawn), which the manifest's runtime names. The JSON of the
// data part is written on one line, as context.editJSON writes a part that holds one (block-script.md,
// Writing back).

const manifest = (id, name, { script, flow, data, page }) => `{
  "id": "${id}",
  "apiVersion": 1,
  "version": "0.1.0",
  "name": { "zh": "${name}", "en": "${name}" },
  "description": { "zh": "一个可以反复使用的块", "en": "A block to use again" },
  "words": "${name}",${page ? '\n  "places": ["page"],\n  "card": { "sizes": [[4, 3], [2, 3]], "resize": true },' : ""}
  "parts": {
    "title": { "at": ":scope > h3", "edit": "${page ? "none" : "text"}" }${data ? ',\n    "items": { "at": ":scope > script", "edit": "data" }' : flow ? ',\n    "body": { "edit": "flow" }' : `,\n    "text": { "at": ":scope > p", "edit": "${page ? "none" : "text"}", "optional": true }`}
  },${script ? `\n  "runtime": { "generated": [".component-drawn"] },` : ""}
  "markdown": "parts"
}
`;

// What an instance holds under its title: its data part's script, its slot holding `blocks`, or its text paragraph.
const instance = (id, title, text, { blocks, json }) => `<div data-doc-component="${id}">
  <h3>${title}</h3>
${json ? `  <script type="application/json">${json}</script>` : blocks ? `  <div data-doc-slot="body">\n${blocks.map((line) => `    ${line}\n`).join("")}  </div>` : `  <p>${text}</p>`}
</div>
`;

// What the example's slot holds: a paragraph and a list, blocks of the document's own.
const EXAMPLE_BLOCKS = ["<p>这里写这个块在一份文档里的样子。</p>", "<ul>", "  <li>插槽里写文档自己的块</li>", "  <li>段落、列表、表格都可以</li>", "</ul>"];

const style = (id, { flow, data }) => `/* Every selector starts at the instance, so that nothing here reaches the rest of the page.${flow ? " Each step is\n   a >, so that none reaches into the slot, whose blocks read as the page's." : ""} */
[data-doc-component="${id}"] { padding: 12px 16px; border: 1px solid var(--doc-border); border-radius: 8px; }
[data-doc-component="${id}"] > h3 { margin-top: 0; }
${data ? `/* The hidden attribute hides a control whatever display the rules below give it (the kit holds [hidden] over a
   style): the field and the buttons are drawn hidden where nothing is written, an export. */
[data-doc-component="${id}"] .component-list { margin: 0 0 8px; padding: 0; list-style: none; }
[data-doc-component="${id}"] .component-list > li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 0; }
[data-doc-component="${id}"] .component-field { display: block; box-sizing: border-box; width: 100%; padding: 4px 8px; border: 1px solid var(--doc-border); border-radius: 6px; background: transparent; color: inherit; font: inherit; }
[data-doc-component="${id}"] .component-remove { padding: 0 8px; border: 1px solid var(--doc-border); border-radius: 6px; background: transparent; color: var(--doc-muted); font: inherit; cursor: pointer; }
` : ""}`;

const writing = (id, name, { script, flow, data, page }) => `# ${name}

What this block is for, and when ${page ? "a custom page" : "a document"} uses it rather than a block of Gallery's own.

## How to write it

Write the element as example.html does: \`gallery block show ${id}\` prints it. Each part, and what goes in it:

- the title, its \`h3\`: required${page ? ", written in the file (a page shows it as written)" : ""}.
${data ? '- the items, its `<script type="application/json">`: `{"items":[{"text":"…"}]}`, each item a line a reader adds on the block and takes away with its button. Leave the items of a block that is there alone: they are the reader\'s.\n' : flow ? '- the body, its `<div data-doc-slot="body">`: required, the document\'s own blocks, written as anywhere in the document (paragraphs, lists, tables, formulas).\n' : "- the text, its `p`: optional.\n"}${page ? `
## On a page

A card of a custom page: \`gallery page add <slug> ${id}\` puts one on it, at the first free spot by its size (4 × 3, or 2 × 3), which the user may change by dragging its edge.
` : ""}
## How it looks

What a reader sees of it, and what it shows while it is empty.${data ? " Where nothing is written (an export) its field and buttons are not shown." : ""}
${script ? `
## Its script

kit.js runs with the rights of a document's own script. What it draws, it draws in what the manifest's \`runtime\` names${flow ? ", outside the slot: it reads the slot and never writes in it" : ""}.${data ? " It reads the items with `context.readJSON` and writes them back with `context.editJSON`, one write for each add or removal (one undo step); `example()` adds an item, by the function the field calls, and works on an empty instance too." : ""}
` : ""}`;

const script = (id) => `// Starts each instance from what the file says, and draws in a node the manifest's runtime names:
// the kit takes that off an instance before it starts one again, as an undo may put one back.
DocKit.component({
  id: "${id}",
  on: ["source"],
  mount(host, context) {
    const drawn = document.createElement("div");
    drawn.className = "component-drawn";
    host.append(drawn);
    const draw = () => { drawn.textContent = context.part("title")?.textContent ?? ""; };
    draw();
    return { update: draw };
  },
});
`;

// The kit.js of --data: the items in a list, a field that adds one and a button that takes one away.
const dataScript = (id) => `// A list of lines a reader keeps in this block. Its data part, items, is a script of JSON:
// {"items":[{"text":"…"}]}. The block draws what it holds on every \`source\` (an undo, an Agent's write,
// the page coming to edit) and writes only on a reader's gesture: a line typed in the field (DocKit.input:
// Enter or leaving the field, never while an input method composes) and a press of a line's button, each
// one context.editJSON, one undo step. A control that writes is drawn only while context.canEdit() and
// hidden otherwise, as an export needs (the hidden attribute: the kit holds it over any display).

/**
 * The items \`data\` holds (context.readJSON's, or the draft context.editJSON hands a change); throws
 * saying why when it is no { "items": [] }, and the block draws nothing over it.
 * @param {any} data
 * @returns {{ text: string }[]}
 */
function itemsOf(data) {
  if (data === null || typeof data !== "object" || !Array.isArray(data.items)) throw new Error('its data is no { "items": [] }');
  return data.items;
}

/**
 * One item more, one write: what the field calls once the reader is done with it, and the example too.
 * Whether it was taken.
 * @param {DocComponentContext} context
 * @param {string} text
 */
function addItem(context, text) {
  return context.editJSON("items", (data) => {
    itemsOf(data).push({ text });
  });
}

/**
 * The item numbered \`index\` taken away, one write: what a line's button calls. Whether it was taken.
 * @param {DocComponentContext} context
 * @param {number} index
 */
function removeItem(context, index) {
  return context.editJSON("items", (data) => {
    itemsOf(data).splice(index, 1);
  });
}

DocKit.component({
  id: "${id}",
  on: ["source", "editable"],
  mount(host, context) {
    const drawn = document.createElement("div");
    drawn.className = "component-drawn";
    const list = document.createElement("ul");
    list.className = "component-list";
    const field = document.createElement("input");
    field.className = "component-field";
    field.type = "text";
    field.placeholder = "写一条，回车添加";
    drawn.append(list, field);
    host.append(drawn);
    const typed = DocKit.input(field, {
      signal: context.signal,
      commit(value) {
        if (value.trim() && addItem(context, value.trim())) typed.set("");
      },
    });
    context.listen(list, "click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button && context.canEdit()) removeItem(context, Number(button.value));
    });
    const draw = () => {
      const data = context.readJSON("items");
      if (data === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      let items;
      try {
        items = itemsOf(data);
      } catch (error) {
        return context.fail(error);
      }
      const writes = context.canEdit();
      list.replaceChildren(...items.map((item, index) => {
        const line = document.createElement("li");
        const words = document.createElement("span");
        words.textContent = item.text;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "component-remove";
        remove.value = String(index);
        remove.textContent = "删除";
        remove.hidden = !writes;
        line.append(words, remove);
        return line;
      }));
      field.hidden = !writes;
    };
    draw();
    return { update: draw };
  },
  example(host, context) {
    addItem(context, "又一条");
  },
});
`;

/**
 * The files of a new package `id`, by name, its manifest first: a kit.js and a `runtime` with `script`
 * (implied by `data`), a slot, body, in place of its text paragraph with `flow`, a data part with
 * kit.js writing it with `data`, places ["page"] and a card with `page` (no slot: `page` and `flow` are
 * refused by the command before this).
 */
export function packageFiles(id, { script: scripted = false, flow = false, data = false, page = false } = {}) {
  const name = id.split("/")[1];
  const options = { script: scripted || data, flow, data, page };
  return {
    "component.json": manifest(id, name, options),
    "template.html": instance(id, "标题", "写在这里。", { blocks: flow && ["<p></p>"], json: data && '{"items":[]}' }),
    "example.html": instance(id, "一个例子", "这里写这个块在一份文档里的样子。", { blocks: flow && EXAMPLE_BLOCKS, json: data && '{"items":[{"text":"第一条"},{"text":"第二条"}]}' }),
    "writing.md": writing(id, name, options),
    "style.css": style(id, options),
    ...(options.script ? { "kit.js": data ? dataScript(id) : script(id) } : {}),
  };
}
