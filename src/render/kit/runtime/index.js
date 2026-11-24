import { createBindings } from "./bindings.js";
import { choose, startChoices } from "./choice.js";
import { popover } from "./popover.js";
import { dehydrateEmbed, showEmbed } from "./embeds.js";
import { FLOWCHART, dehydrateFlowchart, startFlowchart } from "./flowchart.js";
import { dragIn, fieldIn, textIn } from "./gestures.js";
import { createKit } from "./kernel.js";
import { reveal, startBlockLinks } from "./reveal.js";
import { startSpacing, untie } from "./spacing.js";
import { startTips } from "./tip.js";
import { ZOOM_PICTURES } from "../../../shared/zoom.mjs";
import { startZoom, watchZoom } from "./zoom.js";

// /kit/runtime.js (an esbuild bundle of this folder; __COMPONENT_RUNTIME__ is what the kernel reads
// of the components' descriptions, src/shared/components/ `runtimeDescriptions`, __COMPONENT_FLOWS__
// their flows, `FLOWS`, and __COMPONENT_BLOCK_FLOWS__ every element blocks stand straight in,
// `FLOW_BLOCKS`, put in by the build, assets.mjs): DocKit, the kit's runtime, which every other kit
// script registers its component with, and the reading state a report declares (bindings.js), kept as
// components of its own. Loaded first, by every report.

if (!globalThis.DocKit) {
  // The platform, judged where the page is opened (an exported file is read on another machine): an Apple one (macOS, iOS, iPadOS: "macOS" by
  // userAgentData, "MacIntel", "iPhone" or "iPad" by navigator.platform, so the match ignores case) puts
  // data-doc-platform="mac" on the root, which the text's color and smoothing go by (styles/tokens.css, base.css); any other has none.
  // A copy of the view takes the mark off (page.mjs's runtime root attrs), and a mark a saved copy kept is set right here.
  const platform = globalThis.navigator?.userAgentData?.platform || globalThis.navigator?.platform || "";
  if (/mac|iphone|ipad/i.test(platform)) document.documentElement.setAttribute("data-doc-platform", "mac");
  else document.documentElement.removeAttribute("data-doc-platform");
  const kit = createKit({ descriptions: new Map(__COMPONENT_RUNTIME__.map((component) => [component.id, component])) });
  const { store, bindControl, bindShow, CONTROLS } = createBindings();
  kit.component({ id: "bind", selector: CONTROLS, mount: (element, context) => bindControl(element, context) });
  kit.component({ id: "show", selector: "[data-doc-show]", mount: (element) => bindShow(element) });
  // An embed block's PDF, held by an export as a data: address, shown through a blob: one (embeds.js).
  kit.component({ id: "embed", mount: (figure) => showEmbed(figure), dehydrate: (figure) => dehydrateEmbed(figure) });
  // A flowchart's rows, its steps' widths and its arrows, as its directions say and it measures (flowchart.js);
  // laid out again on "layout" too: the document's look changed its text (ui.js, doc-look-request).
  kit.component({ id: "flowchart", selector: FLOWCHART, on: ["resize", "fonts", "content", "layout"], mount: (list, context) => startFlowchart(list, context), dehydrate: (list) => dehydrateFlowchart(list) });
  // The keys bound elements share: the chart and table components bind to them too.
  // `flows`: the selectors of the elements blocks stand in (the descriptions' flows), for the kit's other scripts (the formulas).
  // `reveal`: what hides an element opened (reveal.js), which the page editor's jumps use too.
  // `input`, `text` and `drag`: the gestures a package's component would each write anew (gestures.js);
  // `choose`: the kit's menu of choices (choice.js), which every <select> of the page opens as well;
  // `popover`: the same card holding what a block puts in it (popover.js).
  globalThis.DocKit = Object.freeze({ ...kit, bindings: store, flows: __COMPONENT_FLOWS__, reveal, input: fieldIn, text: textIn, drag: dragIn, choose, popover });
  globalThis.ReportKit = globalThis.DocKit; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)
  // Inline code and formulas an ordinary space apart from the words beside them, number ranges and
  // the marks after a formula held on their lines, long runs in spans that break anywhere, an item of
  // no text over the blocks it holds its line in the flows (spacing.js). A range or a run held keeps
  // nothing to start; an export of the current view, or a copy of a card, lets its span go (untie).
  globalThis.DocKit.component({ id: "range", selector: ".doc-range", added: false, mount: () => null, dehydrate: untie });
  globalThis.DocKit.component({ id: "long-run", selector: ".doc-long-run", added: false, mount: () => null, dehydrate: untie });
  startSpacing(document, __COMPONENT_BLOCK_FLOWS__);
  // A picture clicked opens large over the page (zoom.js; which do is src/shared/zoom.mjs's rule), and
  // one the keyboard reaches with Enter or Space: the page's pictures watched for whether they open.
  startZoom(document);
  globalThis.DocKit.component({ id: "zoom", selector: ZOOM_PICTURES, on: ["resize", "reveal"], mount: (img, context) => watchZoom(img, context) });
  // A link to a block, and an address ending in one, for a reader (reveal.js).
  startBlockLinks(document);
  // A <select> opens the kit's menu of choices, never the browser's popup (choice.js).
  startChoices(document);
  // An element with data-doc-tip shows its words in the kit's tooltip while the pointer rests on it (tip.js).
  startTips(document);
}
