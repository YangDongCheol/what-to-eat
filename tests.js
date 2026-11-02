// Tiny test runner: works in test.html (browser) and run-tests.js (node). Call report() after all tests.
const results = [], pending = [];
function test(name, fn) {
  const pass = () => results.push({ name, ok: true });
  const fail = (e) => results.push({ name, ok: false, msg: e.message });
  try {
    const r = fn();
    if (r && typeof r.then === "function") pending.push(r.then(pass, fail));
    else pass();
  } catch (e) { fail(e); }
}
function eq(a, b) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`expected ${y}, got ${x}`);
}

const M = [
  { name: "김치찌개", emoji: "🍲", ways: ["배달", "외식", "집밥"], tastes: ["든든", "얼큰"], group: ["혼자", "여럿"] },
  { name: "샐러드", emoji: "🥗", ways: ["배달"], tastes: ["가벼운"], group: ["혼자"] },
  { name: "짬뽕", emoji: "🍜", ways: ["배달", "외식"], tastes: ["얼큰"], group: ["혼자", "여럿"] },
  { name: "삼겹살", emoji: "🥓", ways: ["외식"], tastes: ["든든"], group: ["여럿"] },
];
const A = (way, taste, group) => ({ way, taste, group });
const T = 1_000_000_000_000, H = 3600 * 1000;
const RANDS = [() => 0, () => 0.5, () => 0.99];
const names = (args) => RANDS.map(r => pick(...args, r).menu.name).sort();

// --- pick ---
test("filters by all three", () => {
  const r = pick(M, A("배달", "얼큰", "혼자"), [], [], T);
  eq(["김치찌개", "짬뽕"].includes(r.menu.name), true);
  eq(r.cycled, false);
});
test("상관없음 ignores taste", () => {
  eq([...new Set(names([M, A("외식", "상관없음", "여럿"), [], [], T]))], ["김치찌개", "삼겹살", "짬뽕"]);
});
test("excludes eaten within 72h", () => {
  eq(names([M, A("배달", "얼큰", "혼자"), [{ name: "김치찌개", at: T - 71 * H }], [], T]), ["짬뽕", "짬뽕", "짬뽕"]);
});
test("allows after 72h", () => {
  eq(pick(M, A("배달", "얼큰", "혼자"), [{ name: "김치찌개", at: T - 72 * H }], [], T, () => 0).menu.name, "김치찌개");
});
test("all recent → oldest eaten", () => {
  const h = [{ name: "김치찌개", at: T - 10 * H }, { name: "짬뽕", at: T - 20 * H }];
  eq(names([M, A("배달", "얼큰", "혼자"), h, [], T]), ["짬뽕", "짬뽕", "짬뽕"]);
});
test("skips shown", () => {
  eq(names([M, A("배달", "얼큰", "혼자"), [], ["김치찌개"], T]), ["짬뽕", "짬뽕", "짬뽕"]);
});
test("cycles when all shown", () => {
  const r = pick(M, A("배달", "얼큰", "혼자"), [], ["김치찌개", "짬뽕"], T);
  eq(r.menu !== null, true);
  eq(r.cycled, true);
});
test("no match → null", () => {
  eq(pick(M, A("집밥", "가벼운", "여럿"), [], [], T), { menu: null, cycled: false });
});

// --- storage & links ---
const fake = (o = {}) => ({ getItem: k => (k in o ? o[k] : null), setItem: (k, v) => { o[k] = v; } });
const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };

test("loadJSON missing", () => eq(loadJSON(fake(), "history", []), []));
test("loadJSON broken", () => eq(loadJSON(fake({ history: "{oops" }), "history", []), []));
test("storage throws", () => {
  eq(loadJSON(broken, "history", []), []);
  saveJSON(broken, "history", [1]);
});
test("round trip", () => {
  const s = fake();
  saveJSON(s, "lastAnswers", { way: "외식" });
  eq(loadJSON(s, "lastAnswers", null), { way: "외식" });
});
test("addEntry caps at 100", () => {
  const h = Array.from({ length: 100 }, (_, i) => ({ name: "m" + i, at: 100 - i }));
  const out = addEntry(h, "새거", 999);
  eq(out.length, 100);
  eq(out[0], { name: "새거", at: 999 });
  eq(out.some(e => e.name === "m99"), false);
  eq(h.length, 100);
});
test("linkFor 배달", () => eq(linkFor("배달", "김치찌개"), { type: "copy" }));
test("linkFor 외식", () => eq(linkFor("외식", "김치찌개").url, "https://map.naver.com/p/search/" + encodeURIComponent("근처 김치찌개")));
test("linkFor encodes", () => {
  const u = linkFor("집밥", "떡볶이 & 튀김").url;
  eq(u, "https://www.youtube.com/results?search_query=" + encodeURIComponent("떡볶이 & 튀김 레시피"));
});

// --- menu data ---
const WAYS = ["배달", "외식", "집밥"], TASTES = ["든든", "가벼운", "얼큰"], GROUPS = ["혼자", "여럿"];
test("MENUS size", () => eq(MENUS.length >= 50 && MENUS.length <= 80, true));
test("MENUS valid", () => {
  const bad = MENUS.filter(m => !m.name || !m.emoji
    || ![[m.ways, WAYS], [m.tastes, TASTES], [m.group, GROUPS]].every(([v, ok]) => v.length && v.every(x => ok.includes(x))));
  eq(bad.map(m => m.name), []);
  eq(new Set(MENUS.map(m => m.name)).size, MENUS.length);
});
test("every way×group has a menu", () => {
  const empty = [];
  for (const w of WAYS) for (const g of GROUPS) if (!pick(MENUS, A(w, "상관없음", g), [], [], T).menu) empty.push(w + g);
  eq(empty, []);
});

// --- report ---
function report() {
  const failed = results.filter(r => !r.ok);
  const summary = `${failed.length ? "FAIL " + failed.length : "PASS " + results.length}/${results.length}`;
  if (typeof document !== "undefined") {
    document.title = summary;
    document.body.innerHTML = `<h1>${summary}</h1><ul>` +
      results.map(r => `<li>${r.ok ? "✅" : "❌"} ${r.name}${r.ok ? "" : " — " + r.msg}</li>`).join("") + "</ul>";
  } else {
    results.forEach(r => console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : " — " + r.msg}`));
    console.log(summary);
    if (failed.length) process.exitCode = 1;
  }
}
