import { blankedCss } from "../shared/css-references.mjs";
import { ATTRIBUTE, SLOT } from "../shared/components/installed.mjs";
import { lineAt } from "../render/report-tree.mjs";

// What of a component package's style.css reaches outside its instances (gallery block check): a
// page holds that style beside the document's and every other package's, so each selector's subject
// stands in an instance. A selector is held by its steps as CSS reads them: it is scoped when a step of
// it is the instance itself, [data-doc-component="<id>"] on that very compound (in :is() or :has() it
// says nothing of the subject), and what follows that step goes down from it, never beside it. What
// comes before it (html[data-doc-theme="dark"], a section around it) only says when it applies.
//
// A nested rule stands for what the rule around it stands for: & (and :scope in an @scope of the
// instance) is the instance when that rule's subject is, and what follows it goes down from it, as
// above; when that rule's subject is something in the instance, & is that, and a neighbour of it stands
// in the instance too. A nested selector with neither goes down from what is around it by itself, or
// stands beside it when it starts with + or ~. One whose & stands only in a function has no such step:
// CSS reads it as it is, with nothing put in front, so that :not(&) is all the rest of the page, and it
// is held as any selector with no step of the instance. Rules in @media, @supports, @container, @layer
// and @starting-style are read as any; @page reaches the paper of the whole document; the other at-rules
// hold no selector.
//
// Of a package with a slot (a part edited as flow, data-doc-slot), a selector that stands in the
// instance and goes down from it by a blank, at any depth, reaches the document's blocks its slot holds
// too (slotReach), a note: a step written with > goes no further than it says, and an @scope of the
// instance whose lower edge is a slot (to ([data-doc-slot])) stops there. A nested selector with no
// combinator of its own before its first step goes down by a blank, as one in an @scope does, and so
// does one whose & is a rule's that goes down by one, said once, at the rule that goes down.

// The at-rules whose block holds rules of the page.
const GROUPS = new Set(["media", "supports", "container", "layer", "starting-style"]);

// Each character of `text` outside brackets, parentheses and strings, their opening ones among them: `visit(char, at)`.
function atTopLevel(text, visit) {
  let depth = 0;
  let quote = "";
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === "\\") at++;
    else if (quote) quote = char === quote ? "" : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === ")" || char === "]") depth--;
    else {
      if (depth === 0) visit(char, at);
      if (char === "(" || char === "[") depth++;
    }
  }
}

// The rules of a sheet as a tree: { prelude: what stands before its block, with no comment, start: its
// place, children }. Shaped by `shape` (strings blanked too), read from `plain` (comments alone blanked).
function rulesIn(css) {
  const shape = blankedCss(css);
  const plain = blankedCss(css, { strings: true });
  const sheet = { children: [] };
  const open = [sheet];
  let start = 0;
  let depth = 0;
  for (let at = 0; at < shape.length; at++) {
    const char = shape[at];
    if (char === "\\") at++;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (depth > 0) continue;
    else if (char === "{") {
      const rule = { prelude: plain.slice(start, at), start, children: [] };
      open.at(-1).children.push(rule);
      open.push(rule);
      start = at + 1;
    } else if (char === "}") {
      if (open.length > 1) open.pop();
      start = at + 1;
    } else if (char === ";") start = at + 1;
  }
  return sheet.children;
}

// The selectors of a list, each with its place in it.
function selectorsIn(list) {
  const found = [];
  let start = 0;
  atTopLevel(list, (char, at) => {
    if (char !== ",") return;
    found.push({ text: list.slice(start, at), start });
    start = at + 1;
  });
  found.push({ text: list.slice(start), start });
  return found.filter(({ text }) => text.trim());
}

// A selector's steps: { combinator, compound }, the combinator what joins it to the step before (" ",
// ">", "+" or "~"; a first step has none, unless it is a nested selector's that starts with one).
function stepsOf(selector) {
  const steps = [];
  const text = selector.trim();
  let combinator = "";
  let start = 0;
  let end = 0; // where the compound being read ended, once a blank was met
  const close = (at) => {
    if ((end || at) > start) steps.push({ combinator, compound: text.slice(start, end || at) });
    end = 0;
  };
  atTopLevel(text, (char, at) => {
    if (/\s/.test(char)) {
      if (at === start) start = at + 1;
      else end ||= at;
    } else if (">+~".includes(char)) {
      close(at);
      combinator = char;
      start = at + 1;
    } else if (end) {
      close(at);
      combinator = " ";
      start = at;
    }
  });
  close(text.length);
  return steps;
}

// What a compound is made of at its own level: its [attribute] selectors, and whether it holds a &.
function ownSelectors(compound) {
  const attributes = [];
  let open = -1;
  let depth = 0;
  let quote = "";
  for (let at = 0; at < compound.length; at++) {
    const char = compound[at];
    if (char === "\\") at++;
    else if (quote) quote = char === quote ? "" : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "[" && depth === 0) open = at;
    else if (char === "]" && depth === 0 && open >= 0) {
      attributes.push(compound.slice(open, at + 1));
      open = -1;
    }
  }
  let nesting = false;
  atTopLevel(compound, (char) => { nesting ||= char === "&"; });
  return { attributes, nesting, scope: /(?:^|[^\w-]):scope\b/.test(compound) };
}

const rootAttribute = (id) => new RegExp(`^\\[\\s*${ATTRIBUTE}\\s*=\\s*(["'])${id.replace(/[/-]/g, "\\$&")}\\1\\s*i?\\s*\\]$`, "i");

// Whether a selector holds a & at any depth, a function's arguments among them: a string or an
// attribute's value that spells one is none.
const holdsNesting = (selector) => blankedCss(selector).replace(/\\.|\[[^\]]*\]/g, "").includes("&");

// What a selector reaches: { why ("outside", "beside", or null when it stands in the instance), subject
// (of one that does: "instance", the instance itself, or "inside", something in it), deep (of one that
// does: whether it goes down from the instance by a blank somewhere) }. `around`: the subject of the
// rule it is nested in, one of those two, or null at the top of the sheet; `below`: whether that rule
// goes down by a blank.
function reachOf(selector, root, around, below = false) {
  const steps = stepsOf(selector);
  const own = ({ compound }) => ownSelectors(compound).attributes.some((attribute) => root.test(attribute));
  const nested = ({ compound }) => {
    const { nesting, scope } = ownSelectors(compound);
    return Boolean(around) && (nesting || scope);
  };
  const beside = (step) => ["+", "~"].includes(step?.combinator);
  // A blank from step `from` on: a nested selector's first step with no combinator of its own goes down by one.
  const blank = (from) => steps.slice(from).some(({ combinator }, index) => (index + from === 0 ? combinator || " " : combinator) === " ");
  const at = steps.findLastIndex((step) => own(step) || nested(step));
  if (at < 0) {
    if (!around || holdsNesting(selector)) return { why: "outside" };
    return { why: around === "instance" && beside(steps[0]) ? "beside" : null, subject: "inside", deep: below || blank(0) };
  }
  const itself = own(steps[at]) || around === "instance";
  return { why: itself && beside(steps[at + 1]) ? "beside" : null, subject: itself && at === steps.length - 1 ? "instance" : "inside", deep: (!own(steps[at]) && below) || blank(at + 1) };
}

// What the selectors of a rule give the rules nested in it to stand for: the instance when any of them has it as its subject.
const subjectOf = (reaches) => (reaches.some(({ subject }) => subject === "instance") ? "instance" : "inside");

// Whether an @scope (its prelude) stops at a slot: one of its lower edges (`to (…)`) is a step of [data-doc-slot] alone.
const SLOT_EDGE = new RegExp(`^\\[\\s*${SLOT}\\s*(?:\\]|=)`, "i");
const stopsAtSlots = (prelude) => selectorsIn(/\)\s*to\s*\(([^)]*)\)/i.exec(prelude)?.[1] ?? "").some(({ text }) => stepsOf(text).length === 1 && ownSelectors(text).attributes.some((attribute) => SLOT_EDGE.test(attribute)));

/**
 * What of `css` reaches outside the instances of package `id`, in its order: [{ line, what }], each
 * selector of a rule on its own.
 */
export const styleReach = (css, id) => readSheet(css, id).outside;

/**
 * Of a package whose manifest has the slots `slots` (their names), what of `css` goes down from the
 * instance by a blank, and so reaches the blocks a slot holds too, in its order: [{ line, what }], each
 * a note, each selector of a rule on its own. None for a package with no slot.
 */
export function slotReach(css, id, slots) {
  if (slots.length === 0) return [];
  const named = `slot${slots.length === 1 ? "" : "s"} ${slots.join(" and ")}`;
  return readSheet(css, id).deep.map(({ line, words }) => ({ line, what: `${words} also reaches the blocks in ${named}, the document's: write each step with > or wrap the rules in @scope ([${ATTRIBUTE}="${id}"]) to ([${SLOT}])` }));
}

// What `css` reaches of the instances of package `id`: { outside: what reaches outside them, said
// ([{ line, what }]), deep: what stands in them and goes down by a blank ([{ line, words }]) }.
function readSheet(css, id) {
  const root = rootAttribute(id);
  const start = `[${ATTRIBUTE}="${id}"]`;
  const found = [];
  const deep = [];
  const say = (at, selector, why) => {
    const words = selector.replace(/\s+/g, " ").trim();
    found.push({ line: lineAt(css, at), what: why === "beside" ? `${words} reaches what stands beside the instance: what it styles has to stand in it` : `${words} reaches outside the instance: start it at ${start}` });
  };
  // `below`: whether the rule around goes down by a blank; `bounded`: in an @scope that stops at a slot.
  const visit = (rules, around, below = false, bounded = false) => {
    for (const rule of rules) {
      const blank = rule.prelude.length - rule.prelude.trimStart().length;
      const at = rule.start + blank;
      const atRule = /^@([\w-]+)\s*/.exec(rule.prelude.trim());
      if (atRule) {
        const name = atRule[1].toLowerCase();
        if (GROUPS.has(name)) visit(rule.children, around, below, bounded);
        else if (name === "page") found.push({ line: lineAt(css, at), what: "@page reaches the paper of the whole document: an instance has no page of its own" });
        else if (name === "scope") {
          const scoped = /^@scope\s*\(([^)]*)\)/i.exec(rule.prelude.trim())?.[1] ?? "";
          const starts = selectorsIn(scoped).map(({ text }) => ({ ...reachOf(text, root, around), steps: stepsOf(text).length }));
          if (scoped && starts.every(({ why, steps }) => !why && steps === 1)) visit(rule.children, subjectOf(starts), false, bounded || stopsAtSlots(rule.prelude.trim()));
          else say(at, rule.prelude, "outside");
        }
        continue;
      }
      const reaches = selectorsIn(rule.prelude).map(({ text, start: offset }) => {
        const reach = reachOf(text, root, around, below);
        const placed = rule.start + offset + text.length - text.trimStart().length;
        if (reach.why) say(placed, text, reach.why);
        else if (reach.deep && !bounded && !below) deep.push({ line: lineAt(css, placed), words: text.replace(/\s+/g, " ").trim() });
        return reach;
      });
      if (!reaches.some(({ why }) => why)) visit(rule.children, subjectOf(reaches), reaches.some((reach) => reach.deep), bounded);
    }
  };
  visit(rulesIn(css), null);
  return { outside: found, deep };
}
