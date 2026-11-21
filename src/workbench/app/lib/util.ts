export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
/** 快捷键前缀：Windows 显示 Ctrl+，Mac 显示 ⌘ */
export const MOD = IS_MAC ? '⌘' : 'Ctrl+';
/** 把 "Ctrl+⇧+P" 这样的写法按平台转换 */
export const kbd = (s: string) => (IS_MAC ? s.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥') : s);

/** localStorage 读写；隐私模式 / 沙箱环境下可能抛错，一律吞掉 */
export const storage = {
  get<T>(key: string): T | null {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
  },
  set(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
  remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
