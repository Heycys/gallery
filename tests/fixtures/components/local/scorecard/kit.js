// A scorecard: options scored on weighted criteria, drawn from its script of data as a table of
// scores, each a row of dots, and each option's total, the weighted share of the most it could have,
// the highest marked. Where the page edits, a press on a dot gives that score: one context.editJSON,
// one undo step, the JSON written back by the kit as it was laid out, on one line where it was on one,
// else as example.html lays it out, so that the line of that score is all that changes in a file
// written so. The totals are worked out as it draws, never written: the data is the one source of what
// the block says. In an exported file it reads the same and nothing is pressed (context.canEdit()).
//
// Its data: { scale, criteria: [{ name, weight }], options: [{ name, scores }] }, `scale` the most a
// score is (5 when it says none, at most 10), a weight 1 where it says none, and an option's scores
// one for each criterion, in their order, a whole number from 0 to the scale, or null for none yet.
// What it cannot read that way it does not draw over: it fails, and the page shows what the data
// holds as Gallery draws any.

const WORDS = {
  zh: { option: "方案", total: "总分", best: "最高", score: (/** @type {string} */ criterion, /** @type {number} */ score) => `${criterion}：${score} 分` },
  en: { option: "Option", total: "Total", best: "Best", score: (/** @type {string} */ criterion, /** @type {number} */ score) => `${criterion}: ${score}` },
};
const wordsOf = () => WORDS[/^en\b/i.test(document.documentElement.lang) ? "en" : "zh"];

/**
 * @typedef {{ name: string, weight?: number }} Criterion
 * @typedef {{ name: string, scores: (number | null)[] }} Option
 * @typedef {{ scale: number, criteria: Criterion[], options: Option[] }} Scores
 */

/**
 * The scorecard `data` is (context.readJSON's), its data as it stands (what it does not know of kept,
 * to be written back with it) and its scale; throws saying why it is none.
 * @param {any} data
 * @returns {{ data: Scores, scale: number }}
 */
function readScores(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("its data is no object");
  const scale = data.scale ?? 5;
  if (!Number.isInteger(scale) || scale < 1 || scale > 10) throw new Error("its scale is no whole number from 1 to 10");
  const { criteria, options } = data;
  if (!Array.isArray(criteria) || criteria.length === 0 || !criteria.every((each) => typeof each?.name === "string" && (each.weight === undefined || (typeof each.weight === "number" && each.weight >= 0)))) throw new Error("its criteria are no list of { name, weight }");
  if (!Array.isArray(options) || !options.every((each) => typeof each?.name === "string" && Array.isArray(each.scores) && each.scores.length === criteria.length && each.scores.every((/** @type {unknown} */ score) => score === null || (Number.isInteger(score) && Number(score) >= 0 && Number(score) <= scale)))) throw new Error("its options are no list of { name, scores }, a score for each criterion");
  return { data, scale };
}

/**
 * An option's total: what its scores weigh, out of the most they could, from 0 to 100.
 * @param {Criterion[]} criteria
 * @param {number} scale
 * @param {(number | null)[]} scores
 */
function totalOf(criteria, scale, scores) {
  const weights = criteria.map((each) => each.weight ?? 1);
  const most = scale * weights.reduce((sum, weight) => sum + weight, 0);
  return most === 0 ? 0 : Math.round((100 * scores.reduce((/** @type {number} */ sum, score, index) => sum + (score ?? 0) * weights[index], 0)) / most);
}

/**
 * In `data` (the draft context.editJSON hands a change), the score of the option numbered `option` on
 * the criterion numbered `criterion` made `score`, or none where it is that already.
 * @param {any} data
 * @param {number} option
 * @param {number} criterion
 * @param {number} score
 */
function press(data, option, criterion, score) {
  const scores = readScores(data).data.options[option].scores;
  scores[criterion] = scores[criterion] === score ? null : score;
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string | null} className
 * @param {string} [text]
 */
function made(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

DocKit.component({
  id: "local/scorecard",
  on: ["source", "editable"],
  mount(host, context) {
    const words = wordsOf();
    const drawn = made("div", "scorecard-drawn");
    host.append(drawn);

    const draw = () => {
      const data = context.readJSON("scores");
      if (data === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      let read;
      try {
        read = readScores(data);
      } catch (error) {
        return context.fail(error);
      }
      const { scale, data: { criteria, options } } = read;
      const writes = context.canEdit();
      const totals = options.map(({ scores }) => totalOf(criteria, scale, scores));
      const best = Math.max(...totals);
      const table = made("table", "scorecard-table");
      const head = table.createTHead().insertRow();
      head.append(made("th", null, words.option));
      for (const { name, weight = 1 } of criteria) {
        const cell = made("th", null, name);
        cell.append(made("span", "scorecard-weight", ` ×${weight}`));
        head.append(cell);
      }
      head.append(made("th", "scorecard-total", words.total));
      const body = table.createTBody();
      options.forEach(({ name, scores }, option) => {
        const line = body.insertRow();
        const named = made("th", null, name);
        named.scope = "row";
        line.append(named);
        scores.forEach((score, criterion) => {
          const dots = made("span", "scorecard-dots");
          for (let value = 1; value <= scale; value++) {
            const dot = made("button", "scorecard-dot");
            dot.type = "button";
            dot.disabled = !writes;
            dot.toggleAttribute("data-on", value <= (score ?? 0));
            dot.setAttribute("aria-label", words.score(criteria[criterion].name, value));
            dot.setAttribute("aria-pressed", String(value === score));
            Object.assign(dot.dataset, { option: String(option), criterion: String(criterion), score: String(value) });
            dots.append(dot);
          }
          line.insertCell().append(dots);
        });
        const total = made("td", "scorecard-total", String(totals[option]));
        if (totals[option] === best && totals.some((other) => other < best)) {
          line.toggleAttribute("data-best", true);
          total.append(made("span", "scorecard-best", words.best));
        }
        line.append(total);
      });
      // A dot pressed keeps the focus as the table is drawn again, so that the keys go on from it.
      const active = document.activeElement;
      const focused = active instanceof HTMLElement && drawn.contains(active) ? active.dataset : null;
      drawn.replaceChildren(table);
      if (focused) [...table.querySelectorAll("button")].find(({ dataset }) => ["option", "criterion", "score"].every((key) => dataset[key] === focused[key]))?.focus();
    };

    // A press on a dot: that score, or, on the score it has, none.
    drawn.addEventListener("click", (event) => {
      const dot = event.target instanceof Element ? event.target.closest(".scorecard-dot") : null;
      if (!(dot instanceof HTMLElement) || !context.canEdit()) return;
      const [option, criterion, score] = [dot.dataset.option, dot.dataset.criterion, dot.dataset.score].map(Number);
      context.editJSON("scores", (data) => press(data, option, criterion, score));
    }, { signal: context.signal });

    draw();
    return { update: draw };
  },
  // A reader's press, as the check makes one: the first option's first score one more, or 1 past the scale.
  example(host, context) {
    context.editJSON("scores", (data) => {
      const { scale } = readScores(data);
      press(data, 0, 0, ((data.options[0].scores[0] ?? 0) % scale) + 1);
    });
  },
});
