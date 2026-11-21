import { said } from "./i18n/index.mjs";

// An extension's own settings (references/extensions.md "Settings"): what its extension.json declares in
// `settings`, a list of items { key, type, label, default?, help? } that 设置 › 拓展列表 draws on the
// extension's detail and saves itself. The values the user chose are kept beside its switch in the default
// workspace's gallery.json (extensions.<id>.settings: only those that differ from the default, so that a
// default the extension changes later reaches who never chose); what its backend reads is a file of every
// declared key's value, the defaults filled in (./extension-manifest.mjs syncSettingsFile: the path in
// GALLERY_EXTENSION_SETTINGS), and its workbench script `api.settings`. Only `boolean` is a type yet: a type is
// a line of SETTING_TYPES (what a value of it is, what it is when the manifest gives no default, how the
// command line spells one), and the workbench draws a control for each type it knows. Pure: the server,
// the commands and the workbench read declarations by it.

export const SETTINGS_LIMITS = { items: 50, key: 64, label: 100, help: 500 };

/** The types a setting can have: `valid` (a value of it), `empty` (its value when the manifest gives no default), `parse` (a command line's word). */
export const SETTING_TYPES = {
  boolean: {
    valid: (value) => typeof value === "boolean",
    empty: false,
    parse: (text) => ({ true: true, false: false, on: true, off: false }[String(text).toLowerCase()]),
  },
};

/**
 * A setting's key: an identifier of Latin letters, digits and underscores, not starting with a digit, 64 at
 * most, and none of an object's own names (`__proto__`, `constructor`, `toString`…), so that it is a plain
 * object's key, a JavaScript property and a word a command line takes alike.
 */
export const isSettingKey = (key) => typeof key === "string" && key.length <= SETTINGS_LIMITS.key && /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !(key in Object.prototype);

/** What is wrong with `value`, an extension.json's `settings` (said(): the first thing found), or null. */
export function settingsProblem(value) {
  if (!Array.isArray(value)) return said("settings 必须是数组");
  if (value.length > SETTINGS_LIMITS.items) return said("settings 最多 {0} 项", SETTINGS_LIMITS.items);
  const keys = new Set();
  for (const [index, item] of value.entries()) {
    const at = `settings[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return said("{0} 必须是对象", at);
    if (!isSettingKey(item.key)) return said("{0}.key 必须是字母、数字和下划线组成的名字，不以数字开头，最多 64 个字符", at);
    if (keys.has(item.key)) return said("{0}.key 重复：{1}", at, item.key);
    keys.add(item.key);
    if (typeof item.type !== "string" || !Object.hasOwn(SETTING_TYPES, item.type)) return said("{0}.type 不认识：{1}（现在只支持 {2}）", at, JSON.stringify(item.type) ?? String(item.type), Object.keys(SETTING_TYPES).join(", "));
    if (typeof item.label !== "string" || !item.label.trim() || item.label.length > SETTINGS_LIMITS.label) return said("{0}.label 必须是 1 到 {1} 个字符的文字", at, SETTINGS_LIMITS.label);
    if (item.help !== undefined && (typeof item.help !== "string" || item.help.length > SETTINGS_LIMITS.help)) return said("{0}.help 必须是最多 {1} 个字符的文字", at, SETTINGS_LIMITS.help);
    if (item.default !== undefined && !SETTING_TYPES[item.type].valid(item.default)) return said("{0}.default 必须是 {1} 类型的值", at, item.type);
  }
  return null;
}

/**
 * The settings manifest `manifest` declares (one readManifest let through), as Gallery shows them:
 * [{ key, type, label, help?, default }], the label tidied and the default filled in.
 */
export function settingsOf(manifest) {
  return (Array.isArray(manifest?.settings) ? manifest.settings : []).map((item) => ({
    key: item.key,
    type: item.type,
    label: item.label.replace(/\s+/g, " ").trim(),
    ...(item.help ? { help: item.help } : {}),
    default: item.default ?? SETTING_TYPES[item.type].empty,
  }));
}

/** Every declared key's value: the user's (`stored`, gallery.json's) where it is one of its type, else its default. */
export function settingsValues(declared, stored) {
  const kept = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return Object.fromEntries(declared.map((item) => {
    const own = Object.hasOwn(kept, item.key) ? kept[item.key] : undefined;
    return [item.key, own !== undefined && SETTING_TYPES[item.type].valid(own) ? own : item.default];
  }));
}

/** What is wrong with `changes` ({ key: value }, what to set) for the settings `declared` (said()), or null. */
export function changesProblem(declared, changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes) || Object.keys(changes).length === 0) return said("要改的设置不正确");
  for (const [key, value] of Object.entries(changes)) {
    const item = declared.find((each) => each.key === key);
    if (!item) return said("没有这个设置：{0}", key);
    if (!SETTING_TYPES[item.type].valid(value)) return said("{0} 的值必须是 {1} 类型", key, item.type);
  }
  return null;
}

/**
 * What gallery.json keeps of the settings `declared` after `changes` (checked: changesProblem) are made on
 * `stored`: the user's values of the keys still declared, one equal to its default left out (it follows
 * the default again); a key no longer declared is dropped.
 */
export function storedAfter(declared, stored, changes) {
  const values = { ...settingsValues(declared, stored), ...changes };
  return Object.fromEntries(declared.filter((item) => values[item.key] !== item.default).map((item) => [item.key, values[item.key]]));
}
