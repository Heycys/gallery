// The English of Gallery's own blocks' pictures (./pack-pictures.mjs): their examples are Chinese, written for
// who writes with them (example.html), and the English pair of pictures each ships (component-catalog.mjs
// LANGUAGE_PICTURES) is made of these instead: each block's example.html as an English writer would fill it,
// the same parts and the same numbers, and the documents of the workspace it is pictured in, whose titles
// and to-dos the cards that read the workspace show. A maintainer's, as the script is: nothing of Gallery
// reads it. Change it with the example it stands for.

// A sales table, as the views of a table read it (gallery/chart-view's and gallery/metric's examples).
const sales = (rows) => `<table data-doc-chart-source="sales">
  <thead><tr><th>Customer</th><th>Region</th><th>Amount</th><th>Status</th></tr></thead>
  <tbody>
${rows.map((row) => `    <tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("\n")}
  </tbody>
</table>`;

const json = (id, value) => `<div data-doc-component="${id}">
  <script type="application/json">${JSON.stringify(value)}</script>
</div>
`;

// Each block's English example by its name, the pack's id given (the two packs' examples are the same but for
// their ids, gallery-soft's note and static aside, which are their own).
const EXAMPLES = {
  card: (id) => `<div data-doc-component="${id}">
  <h3>This week at a glance</h3>
  <div data-doc-slot="body">
    <p>A card holds the document's own blocks: paragraphs, lists, tables, formulas and chart cards.</p>
    <ul>
      <li>The title says what the card is about</li>
      <li>Write in it as usual; readers edit it as usual</li>
    </ul>
  </div>
</div>
`,
  "chart-card": (id) => `<div data-doc-component="${id}">
  <h3>New users by channel (thousands)</h3>
  <div data-doc-slot="table">
    <table>
      <thead><tr><th>Channel</th><th>Last month</th><th>This month</th></tr></thead>
      <tbody>
        <tr><td>Search</td><td>42</td><td>48</td></tr>
        <tr><td>Social media</td><td>31</td><td>27</td></tr>
        <tr><td>Referrals</td><td>18</td><td>24</td></tr>
        <tr><td>Events</td><td>9</td><td>—</td></tr>
      </tbody>
    </table>
  </div>
</div>
`,
  "chart-view": (id) => `${sales([
    ["Eastline Logistics", "East", "12,800", "Won"],
    ["Northfield Foods", "North", "8,600", "In talks"],
    ["Southbay Home", "South", "15,200", "Won"],
    ["Harbor Electronics", "East", "9,300", "In talks"],
    ["Westridge Energy", "West", "6,400", "Won"],
  ])}
<div data-doc-component="${id}" data-doc-from="sales">
  <script type="application/json">${JSON.stringify({ by: "Region", op: "sum", value: "Amount", title: "Amount by region (USD)" })}</script>
</div>
`,
  countdown: (id) => json(id, { title: "Holiday", date: "2027-02-06" }),
  habit: (id) => json(id, { name: "Read for half an hour", days: ["2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"] }),
  heatmap: (id) => json(id, { words: false }),
  kanban: (id) => `<table data-doc-chart-source="tasks">
  <thead><tr><th>Task</th><th>Status</th><th>Owner</th><th>Due</th></tr></thead>
  <tbody>
    <tr><td>Write the release notes</td><td>To do</td><td>Maya</td><td>Nov 12</td></tr>
    <tr><td>Update the install guide</td><td>To do</td><td>Leo</td><td>Nov 13</td></tr>
    <tr><td>Regression tests</td><td>In progress</td><td>Sam</td><td>Nov 10</td></tr>
    <tr><td>Pick the version number</td><td>Done</td><td>Leo</td><td>Nov 6</td></tr>
  </tbody>
</table>
<div data-doc-component="${id}" data-doc-from="tasks">
  <script type="application/json">${JSON.stringify({ group: "Status", order: "To do,In progress,Done" })}</script>
</div>
`,
  metric: (id) => `${sales([
    ["Eastline Logistics", "East", "12,800", "Won"],
    ["Northfield Foods", "North", "8,600", "In talks"],
    ["Southbay Home", "South", "15,200", "Won"],
    ["Westridge Energy", "West", "6,400", "In talks"],
  ])}
<div data-doc-component="${id}" data-doc-from="sales">
  <script type="application/json">${JSON.stringify({ op: "sum", column: "Amount", unit: "USD" })}</script>
</div>
<div data-doc-component="${id}" data-doc-from="sales">
  <script type="application/json">${JSON.stringify({ where: "Status", is: "Won", title: "Deals won" })}</script>
</div>
`,
  note: (id) => json(id, { text: id.startsWith("gallery-soft/")
    ? "Send the release notes to Lin by Wednesday\nRenew the domain (it runs out on Nov 20)\nDinner with Jay on Friday, table for 7"
    : "Send the quarterly report to Maria by Friday\nBuy milk and eggs\nDentist, Tuesday at 3 pm" }),
  recent: (id) => `<div data-doc-component="${id}"></div>\n`,
  static: (id) => id.startsWith("gallery-soft/") ? `<div data-doc-component="${id}">
  <div>
    <h3>This week's focus</h3>
    <p><small>Nov 10 — Nov 16</small></p>
    <ul>
      <li>Set the release date by Wednesday</li>
      <li>Go through the home page with design</li>
      <li>Finish chapter 3 of Deep Work</li>
    </ul>
    <p><a href="https://example.com/plan">The full plan</a></p>
  </div>
</div>
` : `<div data-doc-component="${id}">
  <div>
    <h3>This week's focus</h3>
    <ul>
      <li>Set the release date by Wednesday</li>
      <li>Go through the home page with design</li>
      <li>Finish chapter 3 of Deep Work</li>
    </ul>
    <p><a href="https://example.com/plan">The full plan</a> · <small>Updated Nov 7</small></p>
  </div>
</div>
`,
  stats: (id) => `<div data-doc-component="${id}"></div>\n`,
  today: (id) => `<div data-doc-component="${id}"></div>\n`,
  todos: (id) => json(id, { done: false }),
  weather: (id) => json(id, { city: "Shanghai", unit: "℃" }),
};

/** The English example of Gallery's own block `id` (<pack>/<name>), or null for a block it has none of. */
export function englishExample(id) {
  const [, name] = id.split("/");
  return Object.hasOwn(EXAMPLES, name) ? EXAMPLES[name](id) : null;
}

/** The workspace's documents in English, as ./pack-pictures.mjs DOCUMENTS: [slug, title, icon, days since it was edited, its body]. */
export const DOCUMENTS = [
  ["weekly", "Product weekly", "📊", 0, "<h2>This week</h2><p>The new home page is live, and retention is two points up on last week.</p><h2>Next week</h2><ul class=\"doc-todo\"><li data-checked>Sort the interview notes</li><li>Go through the home page with design</li><li>Set the release date by Wednesday</li></ul>"],
  ["q4-plan", "Q4 plan", "🎯", 1, "<h2>Goal</h2><p>Bring first-week retention of new users to 45%.</p><ul class=\"doc-todo\"><li>Finish the copy of the pricing page</li><li data-checked>Pick the three main channels</li></ul>"],
  ["reading", "Reading notes: Deep Work", "📚", 2, "<p>Focus is a skill that can be trained. Keep a stretch of each day free of interruptions.</p><ul class=\"doc-todo\"><li>Finish chapter 3</li></ul>"],
  ["trip", "Kyoto trip checklist", "🧳", 4, "<ul class=\"doc-todo\"><li data-checked>Book the hotel</li><li data-checked>Buy the JR Pass</li><li>Get some yen</li></ul>"],
  ["meeting", "Design review notes", "🗒️", 6, "<p>The home cards' corners go to 14, and buttons lose their borders.</p><ul class=\"doc-todo\"><li>Update the buttons in the component library</li></ul>"],
  ["recipes", "Family recipes", "🍳", 9, "<h2>Tomato and egg</h2><p>Scramble the eggs until half set, take them out, and fold them back in once the tomatoes are juicy.</p>"],
];
