// What the editor keeps in the browser's storage: its crash buffer and tab (autosave.mjs, as strings),
// the format brush, the colors, formulas and blocks used lately (JSON). Every call is safe where the
// storage is not: a private window, blocked site data or a full quota store nothing and read nothing,
// and the page works without (a list used lately is then kept for the page's life only).

/** A storage area (`area()`: localStorage or sessionStorage) whose calls never throw. */
export const storageOf = (area, { prefix = "" } = {}) => ({
  get(key) { try { return area().getItem(prefix + key); } catch { return null; } },
  set(key, value) { try { area().setItem(prefix + key, value); return true; } catch { return false; } },
  remove(key) { try { area().removeItem(prefix + key); } catch {} },
  keys() { try { return Object.keys(area()).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)); } catch { return []; } },
});

/** localStorage, safe. */
export const local = storageOf(() => localStorage);

/** What `key` holds as JSON when `valid` says it is fit (by default: when there is something), else `fallback`. */
export function stored(key, fallback, valid = (value) => value !== null) {
  try {
    const saved = JSON.parse(local.get(key) ?? "null");
    if (valid(saved)) return saved;
  } catch {}
  return fallback;
}

/** `value` stored as JSON under `key`. */
export const keep = (key, value) => local.set(key, JSON.stringify(value));

/**
 * A list of what was used lately, newest first, kept under `key`: { read(), use(entry) }. At most
 * `max` entries, those `valid` says are fit (`fallback` when none are); an entry used again moves to
 * the front (`same(a, b)`: whether two are one).
 */
export function recentList(key, { max, valid = () => true, same = (a, b) => a === b, fallback = [] }) {
  let list = stored(key, [], Array.isArray);
  const fits = (entry) => { try { return valid(entry); } catch { return false; } }; // an entry that is no object
  const read = () => {
    const fit = list.filter(fits).slice(0, max);
    return fit.length > 0 ? fit : fallback;
  };
  return {
    read,
    use(entry) {
      list = [entry, ...read().filter((other) => !same(other, entry))].slice(0, max);
      keep(key, list);
    },
  };
}
