# 评分表

A comparison of options, suppliers, plans or candidates, on criteria that weigh differently, for readers who go on to change the scores as they discuss them. Use it where a choice is being made from the scores; a comparison that is only read is a table.

## How to write it

Write the element as example.html does: `gallery block show local/scorecard` prints it.

- the title, its `h3`: required.
- a caption, its `p`: optional, what is compared and by whom.
- the scores, its `<script type="application/json">`:
  - `scale`: the most a score is, a whole number from 1 to 10; 5 when it says none.
  - `criteria`: each `{ "name": …, "weight": … }`, in the order of the columns; a weight is any number from 0, and 1 when it says none.
  - `options`: each `{ "name": …, "scores": [ … ] }`, one score for each criterion in their order, a whole number from 0 to the scale, or `null` for one not given yet.

Write no totals: the block works each out as it draws, the weighted share of the most an option could have, from 0 to 100. Criteria and options are added, renamed or taken out in the source: in the page a reader changes scores and nothing else. Data it cannot read that way shows as it stands, read-only, and the console says why.

## How it looks

A table, an option a row and a criterion a column with its weight, each score a row of dots, and each option's total last, the highest marked. Without its script (a reader with no such package) Gallery shows what the data holds, read-only, as it shows any.

## Its script

kit.js runs with the rights of a document's own script. It draws the table in `.scorecard-drawn`. Where the page edits, a press on a dot gives that score, and a press on the score a criterion has takes it away: one undo step, the data written back by `context.editJSON` as it was laid out: on one line where it was written on one, else as example.html writes it, a criterion or an option on a line of its own, the rest two spaces a level, so that in data written that way the line of the score pressed is all that changes. Any other layout comes back as that one. In an exported file nothing is pressed.
