// Runs tests.js headless with the same script order as test.html, plus node-only checks: `node run-tests.js`
const fs = require("fs"), vm = require("vm"), path = require("path");
for (const f of ["logic.js", "menus.js", "tests.js"]) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, "utf8"), { filename: f });
}

// sw.js is now a one-shot cleanup worker: drop old wte- caches, unregister itself, reload open windows.
function runSw({ keys = [], clientUrls = [] } = {}) {
  const listeners = {}, deleted = [], navigated = [], st = { unregistered: 0 };
  const ctx = {
    self: {
      addEventListener: (t, fn) => (listeners[t] = fn),
      skipWaiting: () => {},
      registration: { unregister: async () => { st.unregistered++; } },
    },
    caches: { keys: async () => keys, delete: async (k) => { deleted.push(k); return true; } },
    clients: { matchAll: async () => clientUrls.map((url) => ({ url, navigate: async (u) => { navigated.push([url, u]); } })) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "sw.js"), "utf8"), ctx);
  return { listeners, deleted, navigated, st };
}
function activate(opts) {
  const s = runSw(opts);
  let done;
  s.listeners.activate({ waitUntil: (p) => (done = p) });
  return done.then(() => s);
}
test("cleanup sw deletes only wte caches", () =>
  activate({ keys: ["wte-v3", "eik-v6", "wte-v1"] }).then((s) => eq(s.deleted.sort(), ["wte-v1", "wte-v3"])));
test("cleanup sw unregisters and reloads clients", () =>
  activate({ clientUrls: ["https://x/a", "https://x/b"] }).then((s) => {
    eq(s.st.unregistered, 1);
    eq(s.navigated, [["https://x/a", "https://x/a"], ["https://x/b", "https://x/b"]]);
  }));
test("cleanup sw has no fetch handler", () => eq(Object.keys(runSw().listeners).sort(), ["activate", "install"]));

// index.html holds one function decide(userAgent, language); extract and run it.
const decide = (() => {
  const src = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const m = src.match(/function decide\([\s\S]*?\n}\n/);
  if (!m) return () => { throw new Error("decide() not found in index.html"); };
  return vm.runInNewContext("(" + m[0] + ")");
})();
const WV = "Mozilla/5.0 (Linux; Android 14; SM-S936N; wv) AppleWebKit", CHROME = "Mozilla/5.0 (Linux; Android 14; SM-S936N) AppleWebKit Chrome/120 Mobile Safari";
test("redirect page: webview ko -> notice ko", () => eq(decide(WV, "ko-KR"), { action: "notice", lang: "ko" }));
test("redirect page: chrome -> redirect", () => eq(decide(CHROME, "en-US"), { action: "redirect" }));
test("redirect page: webview zh -> notice zh", () => eq(decide(WV, "zh-CN"), { action: "notice", lang: "zh" }));
test("redirect page: webview fr -> notice en", () => eq(decide(WV, "fr-FR"), { action: "notice", lang: "en" }));
Promise.all(pending).then(report);
