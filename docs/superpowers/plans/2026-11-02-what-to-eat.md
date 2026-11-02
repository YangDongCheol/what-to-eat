# 오늘 뭐 먹지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 질문 3개에 답하면 최근 3일 안에 먹은 건 빼고 메뉴 1개를 골라주는 모바일 PWA.

**Architecture:** 빌드 도구 없는 정적 파일. 순수 로직(추천·저장·링크)은 `logic.js`에, 화면 조작은 `app.js`에 둔다. 스펙 7절에서는 로직을 `app.js`에 두기로 했지만, 테스트에서 DOM 없이 로직을 불러올 수 있도록 파일만 분리한다. 모든 스크립트는 일반 `<script>` 태그로 불러오고 전역 함수로 노출한다 (모듈·번들러 없음).

**Tech Stack:** HTML, CSS, 바닐라 JS, localStorage, Web App Manifest, Service Worker. 로컬 서버: `python -m http.server 8000` (Python이 없으면 `npx serve -l 8000`).

**Spec:** `docs/superpowers/specs/2026-11-02-what-to-eat-design.md`

## Global Constraints

- 외부 라이브러리·빌드 도구·서버 없음.
- 질문 선택지 문자열은 정확히 다음과 같다. 방식 `배달`/`외식`/`집밥`, 맛 `든든`/`가벼운`/`얼큰`/`상관없음`, 인원 `혼자`/`여럿`.
- 최근 제외 기준: 72시간 (`now - at < 72*3600*1000`).
- 기록 최대 100개. localStorage 키는 `history`, `lastAnswers`.
- 외식 URL: `https://map.naver.com/p/search/` + `encodeURIComponent("근처 " + 메뉴)`.
- 집밥 URL: `https://www.youtube.com/results?search_query=` + `encodeURIComponent(메뉴 + " 레시피")`.
- 배달: 메뉴 이름을 클립보드에 복사하고 `복사됐어요, 배달앱에서 붙여넣기 하세요`를 표시한다.
- 빈 결과 문구: `조건에 맞는 메뉴가 없어요`.
- 모바일 우선, 375px 폭에서 가로 스크롤이 없어야 한다.

## Review Focus

1. **localStorage 접근 자체가 예외를 던짐** (사파리 사생활 보호 모드 등): 앱은 기록 없이 정상 동작해야 한다 → Task 2 `storage throws` 테스트.
2. **클립보드 API가 없거나 거부됨** (http, 구형 브라우저): 메뉴 이름을 선택 가능한 텍스트로 보여준다 → Task 4 Step 4 수동 확인 항목.
3. **[이걸로!]를 연달아 두 번 탭**: 기록이 1번만 저장돼야 한다 → Task 4. 버튼을 누르면 결과 화면을 떠날 때까지 비활성화한다.
4. **띄어쓰기·특수문자가 들어간 메뉴 이름** (예: `떡볶이 & 튀김`): URL이 깨지지 않아야 한다 → Task 2 `linkFor encodes` 테스트.
5. **배포 후 예전 캐시가 계속 보임**: `sw.js`의 캐시 이름에 버전을 넣고, activate 때 예전 캐시를 지운다 → Task 5.

---

### Task 1: 추천 로직 `pick` + 테스트 러너

**Files:**
- Create: `logic.js`, `test.html`, `tests.js`
- Setup: `git init` (아직 저장소가 아님)

**Interfaces:**
- Produces:
  - `type Menu = { name: string, emoji: string, ways: string[], tastes: string[], group: string[] }`
  - `type Answers = { way: string, taste: string, group: string }`
  - `type Entry = { name: string, at: number }` (ms)
  - `RECENT_MS = 72 * 3600 * 1000`
  - `pick(menus: Menu[], answers: Answers, history: Entry[], shown: string[], now: number, rand = Math.random) -> { menu: Menu|null, cycled: boolean }`
    - `cycled: true`이면 조건에 맞는 메뉴를 이번 세션에 모두 봤다는 뜻이다. 호출하는 쪽은 `shown`을 `[menu.name]`으로 초기화한다.
  - `test.html`: `logic.js` → `menus.js`(Task 3 이후) → `tests.js` 순서로 불러온다. `tests.js`는 `test(name, fn)`, `eq(a, b)`를 정의하고, 결과를 본문에 표시하며 `document.title`을 `PASS n/n` 또는 `FAIL k/n`으로 바꾼다.

- [ ] **Step 1: `git init`, 그리고 실패하는 테스트 작성** (`tests.js`)

고정 데이터 `M`(4개)과 `T = 1_000_000_000_000`, `H = 3600*1000`을 쓴다.
```js
const M = [
  { name:"김치찌개", emoji:"🍲", ways:["배달","외식","집밥"], tastes:["든든","얼큰"], group:["혼자","여럿"] },
  { name:"샐러드",   emoji:"🥗", ways:["배달"],            tastes:["가벼운"],     group:["혼자"] },
  { name:"짬뽕",     emoji:"🍜", ways:["배달","외식"],      tastes:["얼큰"],       group:["혼자","여럿"] },
  { name:"삼겹살",   emoji:"🥓", ways:["외식"],            tastes:["든든"],       group:["여럿"] },
];
const A = (way, taste, group) => ({ way, taste, group });
```
테스트 (이름: 기대 결과):
- `filters by all three`: `pick(M, A("배달","얼큰","혼자"), [], [], T)` → 결과 이름이 `["김치찌개","짬뽕"]` 중 하나, `cycled === false`.
- `상관없음 ignores taste`: `A("외식","상관없음","여럿")`로 `rand` 값을 바꿔가며 여러 번 뽑으면 `김치찌개`, `짬뽕`, `삼겹살`이 모두 나온다.
- `excludes eaten within 72h`: history `[{name:"김치찌개", at:T-71*H}]`, `A("배달","얼큰","혼자")` → 항상 `짬뽕`.
- `allows after 72h`: history `[{name:"김치찌개", at:T-72*H}]` → `김치찌개`가 나올 수 있다 (`rand=()=>0`이면 필터 순서상 첫 메뉴).
- `all recent → oldest eaten`: history `[{name:"김치찌개",at:T-10*H},{name:"짬뽕",at:T-20*H}]` → `짬뽕`.
- `skips shown`: `shown=["김치찌개"]`, `A("배달","얼큰","혼자")` → `짬뽕`.
- `cycles when all shown`: `shown=["김치찌개","짬뽕"]` → 메뉴가 있고 `cycled === true`.
- `no match → null`: `A("집밥","가벼운","여럿")` → `{ menu:null, cycled:false }`.

- [ ] **Step 2: 실패 확인**

Run: `python -m http.server 8000` (백그라운드), 브라우저에서 `http://localhost:8000/test.html`을 연다.
Expected: 제목 `FAIL`, `pick is not defined`.

- [ ] **Step 3: `logic.js`에 `pick` 구현**

스펙 6.2절 순서를 그대로 따른다. `rand`는 `Math.floor(rand() * 후보.length)`로 인덱스를 고를 때만 쓴다. 대체 경로에서는 메뉴마다 가장 최근 `at`을 구하고(기록이 없으면 `-Infinity`), 그 값이 가장 작은 메뉴를 고른다.

- [ ] **Step 4: 통과 확인** — 새로고침했을 때 제목이 `PASS 8/8`이면 통과.

- [ ] **Step 5: Commit**
```bash
git add logic.js test.html tests.js
git commit -m "feat: add menu pick logic with tests"
```

---

### Task 2: 저장·링크 헬퍼

**Files:**
- Modify: `logic.js`, `tests.js`

**Interfaces:**
- Consumes: `Entry` (Task 1)
- Produces:
  - `loadJSON(storage, key: string, fallback) -> any`: 값이 없거나, 파싱에 실패하거나, `storage.getItem`이 예외를 던지면 `fallback`을 반환한다.
  - `saveJSON(storage, key: string, value) -> void`: 예외를 삼킨다.
  - `addEntry(history: Entry[], name: string, now: number) -> Entry[]`: 새 배열을 반환한다. 최신 항목이 맨 앞에 오고, 최대 100개까지 유지한다.
  - `linkFor(way: string, name: string) -> { type: "copy" } | { type: "open", url: string }`

- [ ] **Step 1: 실패하는 테스트 추가**

가짜 저장소 `fake = (o={}) => ({ getItem:k=>k in o?o[k]:null, setItem:(k,v)=>{o[k]=v} })`를 쓴다.
- `loadJSON missing`: `loadJSON(fake(), "history", [])`가 `[]`와 같다 (`eq`로 JSON 비교).
- `loadJSON broken`: `fake({history:"{oops"})` → `[]`.
- `storage throws`: `getItem`/`setItem`이 모두 예외를 던지는 객체로 `loadJSON`을 부르면 fallback을 반환하고, `saveJSON`도 예외를 던지지 않는다.
- `round trip`: `saveJSON(s,"lastAnswers",{way:"외식"})` 후 `loadJSON`으로 읽으면 같은 값이 나온다.
- `addEntry caps at 100`: 100개짜리 기록에 추가하면 길이가 100이고, `[0].name`이 새 메뉴이며, 가장 오래된 항목이 빠진다.
- `linkFor 배달`: `{type:"copy"}`.
- `linkFor 외식`: `linkFor("외식","김치찌개").url === "https://map.naver.com/p/search/" + encodeURIComponent("근처 김치찌개")`.
- `linkFor encodes`: `linkFor("집밥","떡볶이 & 튀김").url`이 `encodeURIComponent("떡볶이 & 튀김 레시피")`로 끝난다.

- [ ] **Step 2: 실패 확인** — `test.html`을 새로고침하면 `FAIL`이 표시되고, 새 함수가 정의되지 않았다는 오류가 나온다.

- [ ] **Step 3: 구현** — 위 시그니처 그대로 만든다. URL 형식은 Global Constraints를 따른다.

- [ ] **Step 4: 통과 확인** — `PASS 16/16`.

- [ ] **Step 5: Commit** — `git commit -am "feat: add storage and link helpers"`

---

### Task 3: 메뉴 데이터

**Files:**
- Create: `menus.js`
- Modify: `test.html` (`menus.js` 불러오기 추가), `tests.js`

**Interfaces:**
- Produces: 전역 `MENUS: Menu[]`

- [ ] **Step 1: 데이터 검증 테스트 추가**
- `MENUS size`: `50 <= MENUS.length <= 80`.
- `MENUS valid`: 모든 메뉴에서 `name`, `emoji`가 빈 문자열이 아니다. `ways`, `tastes`, `group`은 각각 길이가 1 이상이고, 값이 모두 Global Constraints의 허용 값에 속한다 (`tastes`에 `상관없음`은 없다). 이름은 서로 겹치지 않는다.
- `every way×group has a menu`: 방식 3개 × 인원 2개, 6가지 조합 모두에서 `pick(MENUS, A(w,"상관없음",g), [], [], T).menu !== null`.

- [ ] **Step 2: 실패 확인** — `MENUS is not defined`.

- [ ] **Step 3: `menus.js` 작성** — 한식·중식·일식·분식·양식·기타를 섞어 50~80개를 만든다. 실제 음식 특성에 맞게 태그를 붙인다 (예: 국밥은 `든든`, 포케는 `가벼운`).

- [ ] **Step 4: 통과 확인** — `PASS 19/19`.

- [ ] **Step 5: Commit** — `git add menus.js && git commit -am "feat: add menu data"`

---

### Task 4: 화면 3개

**Files:**
- Create: `index.html`, `style.css`, `app.js`

**Interfaces:**
- Consumes: `MENUS`, `pick`, `loadJSON`, `saveJSON`, `addEntry`, `linkFor` (Task 1~3)
- Produces: `index.html`에 `<section id="ask">`, `<section id="result">`, `<section id="history">`가 있고, 한 번에 하나만 보인다 (`hidden` 속성으로 전환). 스크립트 순서는 `menus.js`, `logic.js`, `app.js`.

- [ ] **Step 1: 질문 화면** — 질문마다 선택지를 버튼 그룹으로 보여준다 (`aria-pressed`로 선택 상태 표시). 시작할 때 `loadJSON(localStorage,"lastAnswers",{way:"배달",taste:"상관없음",group:"혼자"})` 값으로 미리 선택한다. **[골라줘]**를 누르면 `saveJSON`으로 답을 저장하고, `shown=[]`으로 초기화한 뒤 결과 화면으로 간다. 하단에 "기록 보기" 링크를 둔다.

- [ ] **Step 2: 결과 화면** — `pick(MENUS, answers, history, shown, Date.now())`를 호출한다. `cycled`이면 `shown=[menu.name]`, 아니면 `shown.push(menu.name)`. 메뉴는 이모지와 이름을 크게 보여준다. `menu`가 `null`이면 `조건에 맞는 메뉴가 없어요`를 보여주고 [다시 고르기]만 남긴다.
  - **[다른 거]**: 같은 답으로 다시 `pick`을 호출한다.
  - **[이걸로!]**: 먼저 버튼을 비활성화한다. 그다음 `history = addEntry(...)`를 하고 `saveJSON`으로 저장한 뒤, `linkFor` 결과에 따라 동작한다. `open`이면 `window.open(url, "_blank")`. `copy`이면 `navigator.clipboard.writeText(name)`이 성공했을 때 안내 문구를 보여주고, API가 없거나 실패하면 이름을 `user-select: all` 텍스트로 보여준다. 결과 화면을 떠날 때 버튼을 다시 활성화한다.
  - **[← 다시 고르기]**: 질문 화면으로 돌아간다.

- [ ] **Step 3: 기록 화면** — 기록을 최신순으로 보여준다 (메뉴 이름, `toLocaleString('ko-KR')` 날짜). 항목마다 삭제 버튼이 있고, 누르면 그 항목만 지우고 저장한 뒤 목록을 다시 그린다. 기록이 없으면 `아직 기록이 없어요`를 보여준다.

- [ ] **Step 4: 수동 확인** (브라우저 375×812 폭, `http://localhost:8000/`)
  - 앱을 열고 [골라줘]만 눌러도 메뉴가 나온다 (10초 기준).
  - [다른 거]를 반복해도 같은 메뉴가 연달아 나오지 않는다.
  - [이걸로!]를 빠르게 두 번 눌러도 기록에는 1개만 남는다.
  - 외식이나 집밥에서는 새 탭으로 해당 URL이 열린다. 배달에서는 안내 문구 또는 대체 텍스트가 보인다.
  - 방금 고른 메뉴가 다음 추천에 나오지 않는다.
  - 새로고침해도 지난 답과 기록이 그대로 남아 있다.
  - DevTools에서 `localStorage.history = "{oops"`로 망가뜨린 뒤 새로고침해도 앱이 정상 동작한다.
  - 가로 스크롤이 없고, 콘솔에 오류가 없다.
  - `test.html`이 여전히 `PASS 19/19`이다.

- [ ] **Step 5: Commit** — `git add index.html style.css app.js && git commit -m "feat: add ask/result/history screens"`

---

### Task 5: PWA (설치 + 오프라인)

**Files:**
- Create: `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`
- Modify: `index.html` (manifest 링크, `theme-color` meta, SW 등록)

**Interfaces:**
- Consumes: Task 4의 파일 목록 (캐시 대상)

- [ ] **Step 1: `manifest.json`** — `name: "오늘 뭐 먹지"`, `short_name: "뭐먹지"`, `start_url: "./"`, `display: "standalone"`, 아이콘 192/512. 아이콘은 단색 배경에 🍚 이모지를 넣는다 (canvas로 PNG를 만들거나 직접 준비).

- [ ] **Step 2: `sw.js`** — `CACHE = "wte-v1"`. install 때 앱 파일(`./`, `index.html`, `style.css`, `app.js`, `logic.js`, `menus.js`, `manifest.json`, 아이콘)을 캐시한다. activate 때 이름이 `CACHE`가 아닌 캐시를 지운다. fetch는 캐시를 먼저 보고 없으면 네트워크로 간다. 상대 경로를 쓴다 (GitHub Pages 하위 경로 대응). 파일을 고칠 때마다 버전 숫자를 올린다는 주석을 한 줄 단다.

- [ ] **Step 3: 등록** — `app.js` 끝에 `if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js")`.

- [ ] **Step 4: 확인** — `http://localhost:8000/`에서 DevTools Application 탭을 열면 Manifest에 오류가 없고 Service Worker가 activated 상태다. Network를 Offline으로 바꾸고 새로고침해도 앱이 열리고 추천이 된다.

- [ ] **Step 5: Commit** — `git add . && git commit -m "feat: make installable offline PWA"`

---

### Task 6: 배포 (사용자 승인 필요)

외부에 공개하는 작업이라 사용자 확인을 받은 뒤 진행한다.

- [ ] **Step 1:** 사용자가 GitHub 저장소 이름과 공개 여부를 정한다. `gh repo create <이름> --public --source . --push`로 만든다 (`gh` 로그인이 필요하다).
- [ ] **Step 2:** `gh api -X POST repos/{owner}/{repo}/pages -f "source[branch]=main" -f "source[path]=/"`로 Pages를 켠다. 기본 브랜치가 `master`면 그 이름을 쓴다.
- [ ] **Step 3:** `https://<owner>.github.io/<repo>/`에 접속해서 앱과 `test.html`(`PASS`)을 확인한다. 폰에서 열어 "홈 화면에 추가"를 하고, 비행기 모드에서도 열리는지 확인한다.
