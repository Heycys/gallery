import { say } from "./notices.mjs";
import { failure, postJson } from "./post.mjs";
import { t } from "../../shared/i18n/index.mjs";

// Exporting the report. Saving itself is autosave.mjs.

// "导出报告" builds the offline file from the saved source (exports/<slug>.html); the editor saves
// whatever waits first. The view copy with the reading state is the kit's "导出当前视图副本" (ui.js).

/** Export the report (map: slug, token); returns { ok, path } or { ok: false, reason, message }. */
export async function exportReport(map) {
  say(t("正在导出…"), "prompt");
  try {
    const response = await postJson("/__gallery/workspace/export", map.token, { slug: map.slug });
    const result = await response.json().catch(() => ({ ok: false, reason: "server", message: String(response.status) }));
    if (result.ok) say(t("已导出 {0}", result.path), "note", 6000);
    else say(t("未导出：{0}", failure(result, result.reason)), "error");
    return result;
  } catch {
    say(t("未导出：连不上 Gallery 的服务（gallery open 会启动它）"), "error");
    return { ok: false, reason: "offline", message: t("无法连接预览服务器") };
  }
}
