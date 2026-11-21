import path from "node:path";
import { exportsDirectory } from "../shared/paths.mjs";

// A report's deliverable as the commands give it to the Agent to hand on (SKILL.md's Handoff): the
// absolute path of its export, on a line of its own, labelled as given to the user only when they ask for a file
// (the user's 2026-11-13: the handoff gives the address; it said 交给用户（离线文件）, and every handoff carried it). Given as
// "exports/<slug>.html" alone, it was the one path an Agent had to make whole itself, and after its
// context was compacted one put it in the wrong folder (found testing the skill with Agents, 2026-10-26); the data
// workspace (GALLERY_WORKSPACE) may be anywhere, its exports/ with it. gallery export
// prints it for each report it exported, last; gallery qa's verdict repeats it, the same line.

/** The label the deliverable's line starts with. */
export const DELIVERABLE_LINE = "离线文件（用户要文件时再给）：";

/** The absolute path of report `slug`'s export, as this machine writes it. */
export const deliverablePath = (slug) => path.join(exportsDirectory, `${slug}.html`);

/** The line giving report `slug`'s deliverable: the label, then its export's absolute path. */
export const deliverableLine = (slug) => `${DELIVERABLE_LINE}${deliverablePath(slug)}`;
