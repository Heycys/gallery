import { listPreferenceDocuments } from '../shared/preference-documents.mjs';
import path from "node:path";
import { reportsDirectory } from "../shared/paths.mjs";

// What a command that makes a report says before the Agent writes in it (SKILL.md's workflow, its
// create step): where the documents are (the workspace), and where the user's writing
// preferences are (写作偏好, <workspace>/preferences/, discovered by shared/preference-documents.mjs,
// made from Gallery's default the first time they are read). gallery new and gallery import say it.

/** A path as the commands show it: absolute, as the system writes it (an Agent uses it as it is). */
export const shown = (file) => path.resolve(file);

/**
 * The lines saying where the reports are and where the user's writing preferences are (made from the
 * default when there are none). `reading`: the command only reads (gallery list), and makes the file
 * all the same, since an Agent's first command may be a list and what it prints is what it reads first:
 * a line of its own then says that it was made, and that it is for documents and the user's.
 */
export async function startLines({ reading = false } = {}) {
  const list = await listPreferenceDocuments();
  const enabled = list.filter(item => item.enabled);
  return [
    `工作区：${path.resolve(reportsDirectory)}`,
    ...(enabled.length ? ['写作偏好：以下是启用的文档，按标题和内容选择本次任务适用的规则（gallery preferences list）。', ...enabled.map(item => `  ${item.name}：${shown(item.file)}`)] : ['写作偏好：全部已停用。按本次用户要求写作。']),
    ...list.filter(item => reading && item.made).map(item => `提示：${item.id} was made now from Gallery defaults. Only change writing preferences when the user requests it.`),
  ];
}
