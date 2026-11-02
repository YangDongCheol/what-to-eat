// UI: three screens (ask → result, history). Logic lives in logic.js.
const QUESTIONS = [
  ["way", "어떻게 먹어요?", ["배달", "외식", "집밥"]],
  ["taste", "어떤 게 당겨요?", ["든든", "가벼운", "얼큰", "상관없음"]],
  ["group", "누구랑?", ["혼자", "여럿"]],
];
const $ = (id) => document.getElementById(id);

let store = null;
try { store = window.localStorage; } catch {} // access itself can throw in private mode

// Stored values may be stale or tampered: keep only known options / well-formed entries.
const saved = loadJSON(store, "lastAnswers", {}) || {};
const answers = {};
for (const [key, , options] of QUESTIONS) {
  answers[key] = options.includes(saved[key]) ? saved[key] : (key === "taste" ? "상관없음" : options[0]);
}
let history = loadJSON(store, "history", []);
history = Array.isArray(history) ? history.filter(e => e && typeof e.name === "string" && typeof e.at === "number") : [];
let shown = [];
let current = null;

function show(id) {
  for (const s of document.querySelectorAll("main > section")) s.hidden = s.id !== id;
  $("choose").disabled = false;
  window.scrollTo(0, 0);
}

function renderQuestions() {
  const box = $("questions");
  box.replaceChildren();
  for (const [key, label, options] of QUESTIONS) {
    const fs = document.createElement("fieldset");
    const lg = document.createElement("legend");
    lg.textContent = label;
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const opt of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = opt;
      b.setAttribute("aria-pressed", String(answers[key] === opt));
      b.onclick = () => { answers[key] = opt; renderQuestions(); };
      chips.append(b);
    }
    fs.append(lg, chips);
    box.append(fs);
  }
}

function showPick() {
  const { menu, cycled } = pick(MENUS, answers, history, shown, Date.now());
  current = menu;
  $("notice").replaceChildren();
  const found = Boolean(menu);
  $("choose").hidden = $("another").hidden = !found;
  if (found) {
    shown = cycled ? [menu.name] : [...shown, menu.name];
    $("menu-emoji").textContent = menu.emoji;
    $("menu-name").textContent = menu.name;
  } else {
    $("menu-emoji").textContent = "🤔";
    $("menu-name").textContent = "조건에 맞는 메뉴가 없어요";
  }
  show("result");
}

async function choose() {
  if (!current) return;
  $("choose").disabled = true; // guard double tap; re-enabled when leaving the screen
  history = addEntry(history, current.name, Date.now());
  saveJSON(store, "history", history);
  const link = linkFor(answers.way, current.name);
  if (link.type === "open") {
    window.open(link.url, "_blank", "noopener");
    $("notice").textContent = "맛있게 드세요!";
    return;
  }
  try {
    await navigator.clipboard.writeText(current.name);
    $("notice").textContent = "복사됐어요, 배달앱에서 붙여넣기 하세요";
  } catch {
    const span = document.createElement("span");
    span.className = "copy-text";
    span.textContent = current.name;
    $("notice").replaceChildren("배달앱에서 검색하세요: ", span);
  }
}

function renderHistory() {
  const list = $("history-list");
  list.replaceChildren();
  history.forEach((e, i) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = e.name;
    const time = document.createElement("time");
    time.textContent = new Date(e.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "✕";
    del.setAttribute("aria-label", `${e.name} 기록 삭제`);
    del.onclick = () => {
      history = history.filter((_, j) => j !== i);
      saveJSON(store, "history", history);
      renderHistory();
    };
    li.append(name, time, del);
    list.append(li);
  });
  $("history-empty").hidden = history.length > 0;
}

$("go").onclick = () => {
  saveJSON(store, "lastAnswers", answers);
  shown = [];
  showPick();
};
$("another").onclick = showPick;
$("choose").onclick = choose;
$("back").onclick = () => show("ask");
$("to-history").onclick = () => { renderHistory(); show("history"); };
$("history-back").onclick = () => show("ask");

renderQuestions();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
