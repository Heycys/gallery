import { iconKind } from "../../shared/emoji/icon-value.mjs";
import { ICON_PICKER } from "../../shared/icon-picker.mjs";
import { t } from "../../shared/i18n/index.mjs";
import { openMediaPicker } from "./emoji-picker/index.mjs";
import { connectPicker } from "./emoji-picker/support.mjs";
import { failure, postAnswer } from "./post.mjs";

// The icon picker of the workbench's sidebar (src/shared/icon-picker.mjs, docs/workbench.md "The sidebar",
// **Row icons**): the page's own picker (./emoji-picker/, as a document's header opens it), in a frame the
// workbench lays over its whole window (GET /__gallery/edit/icon-picker: src/server/routes.mjs), transparent
// but for the picker, so that the picker places itself in the window as on a page (under the row's icon,
// flipped where it does not fit) and a press anywhere outside it closes it, as on a page. It writes nothing:
// what the reader picks goes to the workbench (`pick`), which writes it (the open document's page, else the
// workspace's POST icon, a page's page.json, a link's link.json). A custom emoji picked is first copied into
// the document's folder (POST /__gallery/edit/upload with `library`, as the page's own picker does: its
// components/icon/page.mjs pick), and an upload goes there too (the picker's uiStorage, connectPicker): `pick`
// then carries its path in the folder. Where no picture may be the icon (`pictures` false: a custom page, a
// web link, a draft of another workspace) the picker has no 上传 and no 自定义 (index.mjs `pictures`).

const host = window.parent;
const send = (message) => host.postMessage({ protocol: ICON_PICKER, ...message }, location.origin);
// A custom emoji of the library as the picker gives it (shared/emoji/custom.mjs), its id in the library.
const CUSTOM = /^notion:\/\/custom_emoji\/[^/]+\/([^/]+)$/;

let shown = null; // { id, popup }: the picker open now

addEventListener("message", (event) => {
  const message = event.data;
  if (event.source !== host || event.origin !== location.origin || message?.protocol !== ICON_PICKER) return;
  if (message.type === "open") open(message);
  else if (message.type === "close" && shown?.id === message.id) shown.popup.close();
});

function open({ id, origin, value = null, theme = "light", pictures = false, slug = null, token = "" }) {
  shown?.popup.close();
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
  const own = pictures && typeof slug === "string" && slug !== "";
  connectPicker({ slug: own ? slug : "", token, notify: (text) => send({ type: "notice", text }) });
  // The picker closes itself before it hands over a pick (index.mjs submit: close, then onPick), and a custom
  // emoji is copied first: `closed` goes once every pick of this opening is sent, so that the workbench,
  // which forgets an opening as it hears it closed, has them all.
  let picks = Promise.resolve();
  const popup = openMediaPicker({
    origin, value, pictures: own,
    onPick: (picked) => { picks = picks.then(() => pick(id, picked, own ? { slug, token } : null)).catch(() => {}); },
    onClose: () => {
      if (shown?.id === id) shown = null;
      setTimeout(() => picks.then(() => send({ type: "closed", id })));
    },
  });
  shown = { id, popup };
  send({ type: "shown", id });
}

// What the picker gave, as the workbench takes it: a custom emoji copied into the document's folder first.
async function pick(id, value, folder) {
  const custom = CUSTOM.exec(value ?? "")?.[1];
  if (custom) {
    if (!folder) return send({ type: "notice", text: t("这里的图标只能是表情或图标") });
    const answer = await postAnswer("/__gallery/edit/upload", folder.token, { slug: folder.slug, library: custom });
    if (!answer.ok) return send({ type: "notice", text: failure(answer, t("无法使用这个自定义表情")) });
    value = answer.path;
  }
  if (value !== null && !iconKind(value)) return send({ type: "notice", text: t("这张图片没能存进文档") });
  send({ type: "pick", id, value });
}

send({ type: "ready" });
