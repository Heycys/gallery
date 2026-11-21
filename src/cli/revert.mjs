import { commandArguments, UsageError } from "./arguments.mjs";
import { askEdits } from "./edit-ask.mjs";
import { blockSaid, countsSaid, documentOf, failed, localTime, shortOf } from "./history.mjs";

// gallery revert <document> (./usage.mjs): the Agent's changes since the user last kept (确认) or reverted
// them taken back, as the page's 撤回 does (docs/editor.md "Agent's changes": the edit service's POST
// /__gallery/edit/changes, `read`, then `revert` with the stamp it read): the file written as the review's
// baseline, the user's own saved edits in it kept, doc.json's title and icon following the page's.
// Through the workspace's running server when there is one (its queue: an open page shows it at once),
// else here by the same service on the same state (src/cli/edit-ask.mjs). What the file was is kept among
// the recent versions first, which gallery history --restore brings back (the page's 撤销 is the page's own:
// its id lives in the server's memory ten minutes, for the tab that asked); the revert is the Agent's,
// recorded so (the version it leaves is the Agent's, gallery history says). Nothing under review (the
// user kept or reverted it, no Agent wrote since, or its one write filled a new document's starter, which
// is no change: the edit service's isNewDocument): said, exit 1 (gallery history is the way back then).

function nothing(doc) {
  console.error(`问题：${doc.slug}（${doc.title}）没有待审阅的 Agent 修改：用户已经确认或撤回了，或者 Agent 还没改过它（新文档替换起始内容的那次写入不算修改）。什么也没写。`);
  console.error(`下一步：要回到更早的样子，运行 gallery history ${doc.slug} 看各个版本，再用 gallery history ${doc.slug} --restore <版本> 恢复。`);
  process.exit(1);
}

export async function run(argv) {
  const { positional } = commandArguments({ argv });
  if (positional.length !== 1) throw new UsageError("Name one document: gallery revert <document>.");
  const doc = await documentOf(positional[0]);
  // Read, then revert what was read; a write of the Agent's between the two (refused: changed) is read again, once.
  for (let attempt = 1; ; attempt++) {
    const review = await askEdits("changes", { slug: doc.slug, action: "read" });
    if (!review?.ok) failed(review, `没能读到 ${doc.slug} 的 Agent 修改`);
    if (!review.pending) return nothing(doc);
    const answer = await askEdits("changes", { slug: doc.slug, action: "revert", stamp: review.stamp, agent: true });
    if (!answer?.ok && answer?.reason === "changed" && attempt < 2) continue;
    if (!answer?.ok) failed(answer, `没有撤回 ${doc.slug}`);
    if (answer.none) return nothing(doc);
    const since = review.since ? `自 ${localTime(review.since)} 起 ` : "";
    console.log(`撤回了 ${doc.slug}（${doc.title}）里 Agent 的修改（${since}${review.writes ?? 1} 次写入：${countsSaid(answer.counts ?? review.counts)}）：`);
    for (const block of answer.blocks ?? []) console.log(`  ${blockSaid(block, { taken: true })}`);
    if (answer.more) console.log(`  还有 ${answer.more} 块`);
    console.log("用户自己在页面上存过的修改都留着；打开着的页面马上显示撤回后的样子。");
    if (answer.kept) console.log(`提示：撤回前的样子存成了版本 ${shortOf(answer.kept.slice(-16))}；要恢复它：gallery history ${doc.slug} --restore ${shortOf(answer.kept.slice(-16))}（页面上的「撤销」只给在页面上撤回的那个标签页）`);
    return;
  }
}
