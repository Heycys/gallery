/* The picker's image form, in two places:
 *   the 上传 tab (index.mjs): no title, a large preview, an image's link may be pasted, and a box, 同时存进表情库,
 *     that makes the image a custom emoji as well as the icon;
 *   the 添加自定义表情 popup of the 表情符号 tab (emoji-tab.mjs): a title and a line under it, a small preview, no link
 *     pasted, the image always saved as a custom emoji (the popup 280 wide at least).
 * From the top, 16px from each side (the sizes in styles.mjs):
 *   the title (14px / 600) and its line (12px, --ge-tx2): the popup only;
 *   the zone an image goes in (--ge-field, a 1px --ge-edge inside it, rounded 8; a deeper gray while a file is dragged
 *     over it, never blue): with no image one button, an image icon and 上传图片; with one, 预览 over the image twice,
 *     on a light and on a dark background (80 or 48 square; contained when it becomes an emoji, else covering), and
 *     替换 under them where no link may be pasted. A file dropped on it is taken if it is an image (the first one);
 *   the hint that an image may also be dropped or pasted: where a link may be pasted, before an image and with no error;
 *   an error, red, centered;
 *   the box 同时存进表情库: the 上传 tab, once there is an image;
 *   the name (its label, the field, its error under it): when the image becomes an emoji and either no link may be
 *     pasted or there is an image already. A file chosen names it (nameFromFileName) while the name is empty or still
 *     the one the last file's name made;
 *   the footer: at the left 返回 (the 上传 tab with an image: everything cleared) or 取消 (closes); at the right 保存, a
 *     text button, dimmed while it cannot be pressed.
 * 保存:
 *   as an emoji (the popup, or the box checked): only with an image and a valid name no emoji has. The image is stored
 *     (support.mjs uiStorage: the document's folder; a link downloaded by the server, its address kept where it cannot
 *     be), then added to the workspace's library (custom.mjs addCustomEmoji); the status line says so and onDone gets
 *     the emoji's value. A failure is said on the status line;
 *   otherwise: with an image. It is stored and onDone gets its path; a failure is said on the status line.
 *   The status line says why where it is known (an image over 2 MB, the server's refusal in the UI's language, the server
 *   not reached: support.mjs saidError), else that it did not save and to try again.
 *   onStart() is called first: both places close as the saving starts.
 * A paste (where a link may be pasted, before an image): an image file on the clipboard is taken (another file refused);
 *   text is tried as an image's address, and where no image loads from it an error asks for another link.
 * createUploadForm(opts) → { el, focus(), paste(e) }
 *   opts: { showTitle, largeEmoji, allowUrlPaste, confirmToAdd, onCancel(), onStart(), onDone(value) }
 */
import { esc } from './support.mjs';
import { uiStorage } from './support.mjs';
import { icon } from './support.mjs';
import { showSnackbar } from './support.mjs';
import { shortcut } from '../tooltip.mjs';
import { addCustomEmoji, validateCustomEmojiName, nameFromFileName, prepareNameCheck } from '../../../shared/emoji/custom.mjs';
import { t } from "../../../shared/i18n/index.mjs";

/* The types the file dialog offers. A file dropped or pasted is taken if its type is any image. */
const ACCEPT = 'image/jpeg, image/png, image/gif, image/webp, image/avif, image/svg+xml';
/* A link's file name (without its extension, which the server adds by the image's type): the name it is stored under */
const urlBaseName = url => { try { return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()).replace(/\.[a-z0-9]{1,5}$/i, '') || 'image'; } catch { return 'image'; } };
const isImage = file => /^image\//.test(file?.type || '');
const PASTE = shortcut('mod+v');   // Ctrl+V, ⌘V on a Mac
/* Why a name is refused (the reasons of shared/emoji/custom.mjs validateCustomEmojiName), in the UI's language */
const NAME_ERRORS = { chars: t("名字只能用小写字母、汉字、数字、- 和 _"), long: t("名字太长：最多 49 个字符"), taken: t("已经有表情叫这个名字了") };

const T = {
  title: t("添加自定义表情"),
  description: t("存进表情库后，这个工作区的文档都能用"),
  upload: t("上传图片"),
  replace: t("替换"),
  preview: t("预览"),
  pastePrompt: t("也可以把图片拖到这里，或按 {0} 粘贴图片、图片链接", PASTE),
  imageError: t("这个文件不是图片"),
  urlPasteHintImageError: t("没能从这个链接载入图片。<br>按 {0} 粘贴另一个链接", esc(PASTE)),
  confirmToAdd: t("同时存进表情库"),
  nameLabel: t("表情名"),
  namePlaceholder: t("例如 team-logo"),
  onLight: t("浅色背景上的预览"),
  onDark: t("深色背景上的预览"),
  back: t("返回"),
  cancel: t("取消"),
  save: t("保存"),
};

export function createUploadForm({ showTitle = false, largeEmoji = false, allowUrlPaste = false, confirmToAdd = false, onCancel, onStart, onDone }) {
  const el = document.createElement('div');
  el.className = 'ge-picker-upload' + (largeEmoji ? ' large' : '');
  el.innerHTML =
    (showTitle ? `<div class="ge-picker-upload-title">${T.title}</div><div class="ge-picker-upload-description">${T.description}</div>` : '') +
    `<div class="ge-picker-upload-zone-wrap"><div class="ge-picker-upload-zone"></div></div>` +
    `<div class="ge-picker-upload-paste" hidden>${esc(T.pastePrompt)}</div>` +
    `<div class="ge-picker-upload-error" hidden></div>` +
    `<label class="ge-picker-upload-confirm" hidden><div role="checkbox" tabindex="0" aria-checked="false" class="ge-picker-upload-checkbox"></div>${T.confirmToAdd}</label>` +
    `<label class="ge-picker-upload-name" hidden><div class="ge-picker-upload-name-label">${T.nameLabel}</div>` +
      `<div class="ge-picker-upload-input"><input type="text" placeholder="${T.namePlaceholder}" autocomplete="off" spellcheck="false"></div>` +
      `<div class="ge-picker-upload-name-error" hidden></div></label>` +
    `<div class="ge-picker-upload-footer"><div role="button" tabindex="0" class="ge-btn ge-picker-upload-secondary" data-act="secondary"></div>` +
      `<div role="button" tabindex="0" class="ge-btn ge-picker-upload-save" data-primary data-act="save">${T.save}</div></div>` +
    `<input type="file" accept="${ACCEPT}" hidden>`;

  const zone = el.querySelector('.ge-picker-upload-zone'), wrap = el.querySelector('.ge-picker-upload-zone-wrap');
  const paste = el.querySelector('.ge-picker-upload-paste'), error = el.querySelector('.ge-picker-upload-error');
  const confirm = el.querySelector('.ge-picker-upload-confirm'), checkbox = el.querySelector('.ge-picker-upload-checkbox');
  const nameBox = el.querySelector('.ge-picker-upload-name'), nameInput = nameBox.querySelector('input'), nameError = el.querySelector('.ge-picker-upload-name-error');
  const secondary = el.querySelector('[data-act="secondary"]'), save = el.querySelector('[data-act="save"]');
  const fileInput = el.querySelector('input[type="file"]');

  /* The form's state: image { type: 'file', file } | { type: 'url', url }; preview, the address the preview shows */
  let image = null, preview = null, errorHTML = null, name = '', nameErr = null, checked = false, busy = false;
  const savingAsEmoji = () => !confirmToAdd || checked;   // the popup, or the box checked
  const disabled = () => busy || (savingAsEmoji() ? !name || !image || !!nameErr : !image);   // 保存 cannot be pressed

  function update() {
    const hadFocus = el.contains(document.activeElement);   // 重画放图片的区域时焦点别丢（Esc、粘贴还要接着用）
    zone.innerHTML = preview
      ? `<div class="ge-picker-upload-preview${allowUrlPaste ? '' : ' with-replace'}"><div class="ge-picker-upload-preview-label">${T.preview}</div>` +
        `<div class="ge-picker-upload-preview-row"><img class="light" alt="${T.onLight}" src="${esc(preview)}"><img class="dark" alt="${T.onDark}" src="${esc(preview)}"></div>` +
        (allowUrlPaste ? '' : `<div role="button" tabindex="0" class="ge-picker-upload-replace" data-act="choose" aria-label="${T.replace}">${icon('arrowCircleLoopBackwardSmall', 14)}<div>${T.replace}</div></div>`) + `</div>`
      : `<div role="button" tabindex="0" class="ge-picker-upload-button" data-act="choose">${icon('photo', 20)}<span>${T.upload}</span></div>`;
    zone.classList.toggle('contain', savingAsEmoji());
    paste.hidden = !(allowUrlPaste && !image && !errorHTML);
    error.hidden = !errorHTML;
    error.innerHTML = errorHTML || '';
    confirm.hidden = !(confirmToAdd && image);
    checkbox.setAttribute('aria-checked', String(checked));
    checkbox.innerHTML = checked ? `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>` : '';
    const showName = savingAsEmoji() && (!allowUrlPaste || !!image);
    const wasHidden = nameBox.hidden;
    nameBox.hidden = !showName;
    nameError.hidden = !nameErr;
    nameError.textContent = nameErr ? NAME_ERRORS[nameErr] : '';
    secondary.textContent = allowUrlPaste && image ? T.back : T.cancel;
    save.classList.toggle('disabled', disabled());
    save.setAttribute('aria-disabled', String(disabled()));
    if (showName && wasHidden) nameInput.focus();   // the name field takes the focus as it appears
    else if (hadFocus && (!el.contains(document.activeElement) || document.activeElement === save && disabled())) {
      (el.querySelector('[data-act="choose"]') || save).focus({ preventScroll: true });
    }
  }

  /* A name typed: its spaces become "-", then it is checked */
  function setName(value) {
    name = value.replace(/ /g, '-');
    if (nameInput.value !== name) nameInput.value = name;
    nameErr = validateCustomEmojiName(name);
    update();
  }
  prepareNameCheck().then(() => { if (name) setName(name); });   // 查重的数据到了再校验一次

  /* A file chosen: it names the emoji while the name is empty or still the one the last file's name made */
  function setFile(file) {
    errorHTML = null;
    const prevDerived = image?.type === 'file' ? nameFromFileName(image.file.name) : null;
    if (file.name && (name === '' || prevDerived === name)) setName(nameFromFileName(file.name));
    image = { type: 'file', file };
    const reader = new FileReader();
    reader.onload = () => { if (image?.file === file) { preview = reader.result; update(); } };
    reader.readAsDataURL(file);
    update();
  }

  /* Pasted text, tried as an image's address */
  function tryUrl(text) {
    const url = text.trim(), probe = new Image();
    probe.onload = () => { image = { type: 'url', url }; preview = url; errorHTML = null; update(); };
    probe.onerror = () => { errorHTML = T.urlPasteHintImageError; update(); };
    probe.src = url;
  }

  function reset() {   // “返回”
    image = null; preview = null; errorHTML = null; name = ''; nameErr = null; checked = false;
    nameInput.value = '';
    update();
  }

  /* The image stored in the document's folder: a file sent; a link downloaded by the server, its address kept where it cannot be */
  async function storeImage() {
    if (image.type === 'file') return uiStorage.saveFile(image.file, image.file.name || 'image');
    return (await uiStorage.importImage(image.url, name || urlBaseName(image.url))) || image.url;
  }

  async function submit() {
    if (disabled()) return;
    busy = true;
    update();
    const asEmoji = savingAsEmoji(), emojiName = name;
    onStart?.();
    try {
      const url = await storeImage();
      if (!asEmoji) return onDone(url);
      const value = await addCustomEmoji({ name: emojiName, url });
      showSnackbar(t("已把 {0} 存进表情库", emojiName));
      onDone(value);
    } catch (error) {
      // Why, where it is known (too big, no image, the server not reached); else that it did not save.
      showSnackbar(error?.said ? error.message : asEmoji ? t("没能存进表情库，请再试一次") : t("没能上传这张图片，请再试一次"));
    } finally {
      busy = false;
      if (el.isConnected) update();
    }
  }

  const choose = () => { fileInput.value = ''; fileInput.click(); };
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!isImage(file)) { errorHTML = T.imageError; update(); return; }
    setFile(file);
  });
  el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'choose') choose();
    else if (act === 'save') submit();
    else if (act === 'secondary') { if (allowUrlPaste && image) reset(); else onCancel?.(); }
    else if (e.target.closest('.ge-picker-upload-confirm')) { e.preventDefault(); checked = !checked; update(); }
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target === nameInput) { e.preventDefault(); submit(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"], [role="checkbox"]')) { e.preventDefault(); e.target.click(); }
  });
  nameInput.addEventListener('input', () => setName(nameInput.value));

  /* A file dropped on the zone: the first one, taken if it is an image */
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  wrap.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); wrap.classList.add('dragover'); });
  wrap.addEventListener('dragleave', e => { if (!wrap.contains(e.relatedTarget)) wrap.classList.remove('dragover'); });
  wrap.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    wrap.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!isImage(file)) { errorHTML = T.imageError; update(); return; }
    setFile(file);
  });

  update();
  return {
    el,
    focus() { (nameBox.hidden ? el.querySelector('[data-act="choose"]') : nameInput)?.focus({ preventScroll: true }); },
    /* The page's paste while the 上传 tab shows (index.mjs), before an image: a file on the clipboard first, else text */
    paste(e) {
      if (!allowUrlPaste || image || e.target === nameInput) return;
      e.preventDefault();
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) {
        if (!isImage(files[0])) { errorHTML = T.imageError; update(); return; }
        setFile(files[0]);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text) tryUrl(text);
    },
  };
}
