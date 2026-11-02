// Pure logic (no DOM): menu picking, storage helpers, outbound links.
const RECENT_MS = 72 * 3600 * 1000;

function matches(menu, a) {
  return menu.ways.includes(a.way)
    && (a.taste === "상관없음" || menu.tastes.includes(a.taste))
    && menu.group.includes(a.group);
}

// Returns { menu, cycled }. cycled: every match was already shown this session — caller resets shown to [menu.name].
function pick(menus, answers, history, shown, now, rand = Math.random) {
  const matched = menus.filter(m => matches(m, answers));
  if (!matched.length) return { menu: null, cycled: false };
  let pool = matched.filter(m => !shown.includes(m.name));
  const cycled = !pool.length;
  if (cycled) pool = matched;

  const lastAt = {};
  for (const e of history) lastAt[e.name] = Math.max(lastAt[e.name] ?? -Infinity, e.at);
  const fresh = pool.filter(m => !(now - (lastAt[m.name] ?? -Infinity) < RECENT_MS));
  if (fresh.length) return { menu: fresh[Math.floor(rand() * fresh.length)], cycled };
  // Everything was eaten recently: take the one eaten longest ago.
  const oldest = pool.reduce((a, b) => (lastAt[b.name] < lastAt[a.name] ? b : a));
  return { menu: oldest, cycled };
}

// Storage may be missing, full, or throw (private mode) — never let that break the app.
function loadJSON(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

function saveJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch {}
}

const HISTORY_MAX = 100;
function addEntry(history, name, now) {
  return [{ name, at: now }, ...history].slice(0, HISTORY_MAX);
}

function linkFor(way, name) {
  if (way === "외식") return { type: "open", url: "https://map.naver.com/p/search/" + encodeURIComponent("근처 " + name) };
  if (way === "집밥") return { type: "open", url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(name + " 레시피") };
  return { type: "copy" };
}
