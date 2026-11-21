# Project report writing guidelines

## Writing conventions

You will write a document that reports on the project to an outside audience, based on the project materials available so far (or on the project as the user describes it in the conversation). **First really understand the project, then decide what a reader meeting this project for the first time most needs to know, what they are likely to ask, and in what order they should learn it; then write it out cleanly and clearly.**

- **Assume the reader has no context on the project**: The reader has general domain knowledge but has never seen this project, experiment or report. Define abbreviations and project-internal names the first time they appear. Open with a sentence or two on the problem the project sets out to solve. Explain internal names and custom metrics the first time they are used; when comparing several versions, also set out how they differ and the counting basis they share. Once something has been made clear in the report, use it directly later on.
- **Precise terms and few pronouns**: When a new section starts, or when the thing referred to is no longer nearby or no longer clear, write out its full name again; do not lean on pronouns or shorthand such as "these two models" or "this metric". Every section should make sense to a reader who reads it once from start to finish, without having to look in later sections for a definition or a reason. Common domain terms can be used as they are. Explain internal IDs, custom metrics and easily confused versions in a sentence the first time they appear.
- **Choosing content — only the settled main line**: The materials usually record the whole exploration: abandoned approaches, failed experiments, parameter sweeps and repeated patching. Do not copy that history over. Distill the process in use now: what goes in, which key steps it passes through, what quality checks it has, and what comes out. Include a failure or a design change only when it is needed to understand a current conclusion, risk or design constraint. The goal is to present a clean project, not to replay the team's trial and error.
- **Short noun phrases as headings**: Headings help readers find content; they do not narrate it. Use noun phrases of the form "topic + aspect" or "stage + object" (for example "Web sample labeling scheme", "Phase 2 test results", "Scoring logic rework"). Do not use questions ("What did this phase test?"), verb–object phrases ("Using nine labels to describe a web sample") or full statements ("We reworked the scoring logic") as headings. Headings may use domain terms and do not need the conversational feel the body text calls for.
- **Data, experiments and attribution must be unambiguous**: When you report a number, a comparison or a causal claim, state explicitly: what it is about (model, version, dataset, sample set); the counting basis (sample size, time window, inclusion or exclusion criteria); how the number was calculated (numerator, denominator, metric definition); what the baseline is and whether the conditions are the same; what the number concretely means (not just the name of the metric); and whether the causal claim rests on direct observation or on inference. When you strip out engineering detail and the exploration history, keep the definitions and counting basis needed to read a number correctly.
- **No straw men to knock down, no empty abstractions**: Do not invent a misunderstanding the reader would not have had, only to refute it. Banned sentence patterns (including every variant with the same meaning): "X does not equal / does not mean / does not represent Y", "X should not be seen as Y", "is not yet enough to prove", "not X, but Y", "still … neither … nor …", "X does not serve as Y". If there really is an ambiguity (for example, a number you just gave could be misread), clear it up by stating the correct fact directly, without negating anything first. Also, replace abstract shorthand words such as "closing the loop", "operationalizing", "focus", "end-to-end", "methodology", "synergy", "breaking down silos", "convergence", "empowerment", "capturing learnings", "granularity" and "paradigm" with concrete actions or results, unless the word is quoted verbatim from the materials, or is a necessary technical term with a concrete object in the sentence.
- **When cases are asked for, keep them as complete as you can**: Show a case only when you are asked to show the original example, or when readers need to see the actual answers to follow a section's judgment. When several cases show the same thing, pick the one that shows the difference best and give sources for the rest. For the case you pick, keep the original question, the relevant answers, the grounds for the verdict and the source; when a conclusion involves a calculation or a tool call, keep that process. Keep a case the user names in full, as asked. Use a toggle block to fold away a very long case, but do not delete any of its content.

### Body text

- **Sentences should unfold in a straight line**: Do not pack background, conditions, actions, results and effects into one long compound sentence. Use a concrete subject and say clearly who or what did the thing; avoid passive sentences and nominalizations (write "we adjusted the sampling ratio", not "the sampling ratio underwent an adjustment"). Connect short sentences with words like "so", "then" and "as a result"; do not nest clause within clause. The standard for readability is a spoken briefing: listeners can follow without going back to hear it again. Keep body sentences direct and plain; when you can name the concrete action, input, calculation or result, do not keep falling back on defensive contrasts, and do not use abstract project-speak.
- **Each sentence carries one main claim**: State concrete actions with phrases like "we went back over the wrong answers", "which samples we removed" and "after checking, we got a few more right". Make the object clear first, then carry on with "this batch of data" or "this version".
- **Break each section's body into points by item**: Use concrete nouns for headings, such as "Recipe selection", "File handoff" and "Final evaluation". When parallel items need to be scanned, name each one's subject in a few bold words. A point that a short sentence can state plainly can simply start with that sentence.
  - **Sentences per point**: Start each point with one complete sentence; add a second only when you need to give the basis, note an exception or say what comes next. In a few cases, such as a complex comparison, a point can run to a third sentence.
  - **Number of points**: Usually write 2–3 points; what was done and how it turned out can each take one. When a section covers several groups of work, group them under short headings and write each group about its own work.
  - **Length of points**: **An ordinary point needs only about 25–50 words.** A goal that one sentence covers can be shorter. Past 60 words, check whether the point has changed topic or stacked up several conditions, then decide whether to cut it, split it or use a table.
- The first sentence states the point's most important fact directly. Examples:
  - **Writing up an experiment**: Two adjacent points usually work. The first says what changed this time, the second gives the result. When there is already a decision or an experimental conclusion, you can start straight from the decision or the change. Reorganize scattered material around the main line of the current work. Keep the changes, reasons and results of the same piece of work together. Go into failed experiments only when they explain a current choice or risk.
  - **Writing up background**: Usually say first what problem came up (what used to be laborious), then how you plan to solve it this time. **Writing up an investigation** starts instead from the anomaly you saw, then moves on to what the follow-up check found and how it was handled.

## Opening summary

When you write a report from project materials, you can finish by adding a `.doc-summary` block that gives a reader with no background a quick overview of the whole document. When you are converting a format or writing to an outline the user has approved, keep the required structure. Write the summary only after the body, the evidence and the conclusions have settled, then place it after `.doc-header` and before the first `.doc-section`. Move every paragraph of explanatory text under `.doc-title` into the summary or the body.

The summary is a compressed overview of the whole report: say clearly what the project does, the relevant scope or method, and the most important results or current output. Organize it under short, general noun phrases, such as "Recipe selection", "File handoff" and "Final evaluation". Do not use a question such as "What does this report show?", headings written as full sentences, or headings that only repeat one finding. Follow each subheading with a short paragraph (a few sentences) or a few list points.

The summary first says what problem the work solves, then gives the most important result or current progress. When one sentence says it all, write just that sentence; when there are several parallel pieces of work, split them into points under short headings. Add a summary only when you write the whole report; when you write a single section of it, go straight into the body.

Write list items as `<strong>Item title:</strong> content`. Use `<strong>`, not `h1`–`h6`; the summary should not add a level to the document outline. Do not put detailed evidence, tables, charts, long formulas or complete cases in this block.

```
<section class="doc-summary" aria-label="Report summary">
  <p><strong>🧭 Experiment background</strong></p>
  <p>In a short paragraph, describe the project, what is being analyzed and the main goal.</p>

  <p><strong>🧪 Experiment design</strong></p>
  <ul>
    <li><strong>Scope of comparison:</strong> Name the key versions, the samples and the shared counting basis.</li>
    <li><strong>Evaluation method:</strong> Briefly describe the parts of the design that help readers understand the results.</li>
  </ul>

  <p><strong>📈 Experiment results</strong></p>
  <ul>
    <li><strong>Main findings:</strong> State the most important results that readers can verify in the body.</li>
    <li><strong>Current output:</strong> Describe the reports, data or deliverables already produced.</li>
  </ul>
</section>
```

## Evidence and data

- When sources, original figures or run logs in the materials would let readers verify something, give a readable link right next to it. When a full case needs to be shown, keep the question, the answers and the grounds for the verdict as separate parts. In the summary, mention only what the case shows.
- Write results and statuses as the materials give them: leave an empty value empty, and mark what is still to be updated as such. When only some samples have results, state the scope that has been verified; do not infer the other samples' status from the results you have.
- Keep units, time ranges, checkpoints, sample counts, scopes and baseline names.
- When statistics draw on model answers, reasoning traces or scoring records, state the specific checkpoint or experiment version that produced them, the evaluation scope, and the most precise task or job reference you can find. If the report puts results aggregated over several checkpoints next to raw records that come from a single checkpoint, state separately which checkpoint the raw records come from; do not write something vague like "raw answers and scores".
- For transformed values, state what operation was applied: averaging, weighted averaging, normalization, differencing, smoothing, filtering, or restricting to a common subset.
- When you keep both the raw materials and the normalized chart data, store them separately.
- Do not compare values with incompatible definitions side by side without a prominent note.
- Put detailed provenance in `materials/README.md` or `report.json`; put source notes that matter to readers next to the chart.

## Other requirements

- Between the report title and the opening summary or the first body section, keep at most one line naming the source. Move explanations, abstracts, metadata lines and paragraphs that set out background into the summary or the body; do not pile them up under the title.
- Do not put small all-caps labels, abbreviations or decorative tags above a heading, unless they convey a scope, time period or status given in the materials.
- Do not turn ordinary "assumptions", "judgments" or "conclusions" into separate callouts. Save callouts for content the materials ask to emphasize, risks, warnings, status, or caveats that materially change how something is understood.
- Do not put a line of small grey explanatory text under every section heading. When a section needs an introduction, state the actual points in one or two paragraphs of ordinary body text.
