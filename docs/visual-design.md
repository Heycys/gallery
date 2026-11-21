# Visual design

The maintainers' lookup for the page as a whole, which the skill does not hold: each component's own rules are in its card ([components/table.md](components/table.md), [components/figure.md](components/figure.md) for a figure's card, [components/custom-chart.md](components/custom-chart.md) for a chart). The opening summary and the user's rules on source fidelity are the Agent's, in 写作偏好 (`<workspace>/preferences/`; a new workspace's first one, 通用写作, made from Gallery's short generic default, [src/shared/writing-preferences.md](../src/shared/writing-preferences.md)).

## Composition

- Let the reading task determine the page. A comparison document, timeline, research map, and interactive explorer should not share one compulsory dashboard layout.
- Add summary metrics only when they change how the reader interprets the plots.
- Use open sections by default. Cards are framed by the kit: draw no frame of your own inside one (a figure's drawing has no outer border, background or shadow), and put no frames or cards of your own around other blocks.
- Shared components own their spacing: summaries, columns, figures, table wrappers, callouts, headings, and disclosures already carry the maintained block rhythm. Do not add report-specific margins to compensate; override a shared value only for a deliberate layout exception.
- Reading-oriented documents use the shared centered 712px column, with one pair of horizontal boundaries for title, prose, callouts, charts, and table wrappers. Ordinary top-level prose fills that width; do not give selected paragraphs a smaller left-aligned `max-width`, which creates an unintended extra right margin.
- Keep the shared type sizes for body copy, notes, captions, tables, and charts. Do not reduce table type to fit more columns, keep the text of a chart or a drawing at 13px or more (never under 11px as a viewBox scales it at 360px), and do not override the shared sizes per document.
- Treat explanatory paragraphs about content, reading, or component behavior as body copy: ordinary paragraphs in their flow. Reserve `.doc-note` for brief supporting labels, units, or scope notes.
- Avoid gradients, decorative shadows, rainbow coloring, repeated pill controls, oversized titles, and walls of identical cards.
- The kit adds the shared top-right display settings (look, full width, a copy of the view) to every page it serves and exports. Do not add report-specific copies or competing theme controls.

## When gallery qa cannot run

Without Chrome or Edge, `gallery qa` cannot look at the export (SKILL.md, "Export and check"): the Agent says so in the handoff and takes no pictures of its own unless the user asks (2026-11-13). Asked, open `exports/<slug>.html` in a browser at 1024, 736 and 360px and check: the page does not scroll sideways (only table wrappers and formula blocks do), disclosures holding wide tables opened, numeric columns centered and text left-aligned, a tall table's header staying at the top of its wrapper, and every chart drawn with no clipped or overlapping labels. Say in the handoff that the tool did not run.

Do not test or operate the top-right shared controls (theme, reading or full width, the view copy) unless the user asks.
