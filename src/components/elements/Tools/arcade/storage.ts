// localStorage can throw (private mode, blocked site data) or come back empty,
// so every read and write goes through these guards. Keys are namespaced.
const PREFIX = 'arcade:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the game still works, it just won't remember */
  }
}
