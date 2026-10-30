/* ===================== 設定 ===================== */
const CONFIG = {
  TIME_LIMIT: 60,        // 秒
  SUBMIT_AFTER: 15,      // 幾秒後出現交卷
  REROLL_LIMIT: 1,       // 政見可換幾次
  RECORDS_KEPT: 5,
  STORAGE_KEY: 'balanced-taipei-records-v1',
  PATTERNS: [[4, 2, 2, 1, 1], [3, 3, 2, 1, 1], [4, 3, 1, 1, 1]],
};
// 陣列順序依 N.E.W.S.：0 黑（整體）、1 藍（北）、2 紅（東）、3 黃（西）、4 綠（南）
// 點擊時 index + 1 循環；要和 CSS 的 --c0～--c4 保持同一順序
const COLORS = [
  { name: '黑', hex: '#242830' },
  { name: '藍', hex: '#3975a5' },
  { name: '紅', hex: '#d65c60' },
  { name: '黃', hex: '#e4c45f' },
  { name: '綠', hex: '#66a782' },
];
const POLICIES = [
  { area: '全台北', tag: 'TAIPEI N.E.W.S.', title: '讓台北更 New、更好',
    text: '台北兼具科技發展、國際能量與歷史底蘊，每一區都有獨特的魅力，也蘊藏著進步的無限可能。' },
  { area: '北區', tag: 'NEXT-GEN', title: 'AI 科技新世代',
    text: '以北士科為核心，串聯內科、南軟，打造科技產業廊帶，讓台北持續站上國際科技發展的舞台。' },
  { area: '東區', tag: 'ENERGY', title: '日夜動能活力',
    text: '匯聚國際金融商務，結合大巨蛋的賽事展演、信義區的時尚潮流，讓東區從白天到夜晚都充滿活力。' },
  { area: '西區', tag: 'WATERFRONT', title: '世界級首都門戶',
    text: '以台北車站六鐵共構的交通優勢、台北雙星的發展願景，以及艋舺、大稻埕的歷史底蘊，打造接軌國際的首都門戶。' },
  { area: '南區', tag: 'SPIRIT', title: '水岸生活新篇章',
    text: '串聯河畔水岸、大學校園、公館商圈與藝文景點，打造親水、宜居的水岸生活新篇章。' },
];
// 等級代碼只在程式和 localStorage 裡使用，畫面上顯示的是市民的反應
const GRADE_LABELS = {
  'SS+': '你是神嗎？',
  'SS': '非常滿意',
  'S': '滿意',
  'A': '還算滿意',
  'B': '普普通通',
  'C': '不是很滿意',
  'D': '實在不滿意',
  'E': '非常不滿意',
};
function gradeLabel(grade) { return GRADE_LABELS[grade] || grade; }
// 分享頁 share/<slug>.html，要和 tools/build_share_pages.py 一致
const GRADE_SLUGS = { 'SS+': 'ss-plus', 'SS': 'ss', 'S': 's', 'A': 'a', 'B': 'b', 'C': 'c', 'D': 'd', 'E': 'e' };
// 市民的反應：前半句看「偏不偏」，太善變時再補一句
const CITIZEN_VOICE = {
  'SS+': '每個方向都照顧到了，又幾乎沒有多餘的改動，市民對你五體投地，為你高歌「安可」！',
  'SS': '市民很滿意城市的均衡發展，也許您有當市長的才華喔！',
  'S': '市民大致滿意，每個方向都有照顧到，當然這些滿意是放心裡的，勇敢講出來更好，您說是吧？',
  'A': '市民覺得還不錯，只是還有改善空間，但沒關係，默默做正事就該被看到，為你加油！',
  'B': '市民覺得規劃稍微有點偏，之後再努力看看，一定有機會讓評價更好！',
  'C': '不少市民覺得規劃有待改善，是不是因為你用了太多很漂亮的抽象名詞打高空？',
  'D': '市民抱怨聲四起，覺得你的規劃很糟糕。但，這應該不是因為市民配不上你的才智，對吧？',
  'E': '市民很不滿意，城市發展嚴重失衡！',
};
// 點擊數超過參考步數 2 倍時補一句；好評用「不過」轉折，負評用「而且」加重
function citizenComment(grade, steps, ref) {
  if (grade === 'SS+' || steps <= ref * 2) return CITIZEN_VOICE[grade];
  const joint = ['SS', 'S', 'A', 'B'].includes(grade) ? '不過' : '而且';
  return CITIZEN_VOICE[grade] + joint + '大家也覺得你改來改去，有點善變。';
}

/* ===================== 純邏輯（不碰 DOM） ===================== */
function hashSeed(str) {               // xmur3
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function makeRng(seedStr) {            // mulberry32
  let a = hashSeed(String(seedStr));
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
// 最大餘數法：把比例換成剛好加總為 n 的整數
function apportion(ratio, n) {
  const sum = ratio.reduce((a, b) => a + b, 0);
  const raw = ratio.map(r => r * n / sum);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).slice(0, left).forEach(([, i]) => out[i]++);
  return out;
}
function idealCounts(n) {              // 63 → [13,13,13,12,12]
  const base = Math.floor(n / 5), rem = n % 5;
  return [0, 1, 2, 3, 4].map(i => base + (i < rem ? 1 : 0));
}
function countColors(state) {
  const c = [0, 0, 0, 0, 0];
  for (const v of state) c[v]++;
  return c;
}
// 與理想分佈的差距（不指定哪個顏色該多一格）
function deviation(counts, ideal) {
  const s = counts.slice().sort((a, b) => b - a);
  let d = 0;
  for (let i = 0; i < 5; i++) d += Math.abs(s[i] - ideal[i]);
  return d;
}
function makeStartState(seedStr, n) {
  const rng = makeRng(seedStr);
  const pattern = CONFIG.PATTERNS[Math.floor(rng() * CONFIG.PATTERNS.length)];
  const amounts = apportion(pattern, n);
  const colorOrder = shuffle([0, 1, 2, 3, 4], rng);
  const state = [];
  amounts.forEach((amt, i) => { for (let k = 0; k < amt; k++) state.push(colorOrder[i]); });
  shuffle(state, rng);
  return { state, rng, pattern };
}
function applyClick(state, affected, i, dir = 1) {
  for (const k of affected[i]) state[k] = (state[k] + dir + 5) % 5;
}
// 參考步數：貪婪 + 卡住時往前看兩步
function referenceSteps(start, affected, ideal, rng, cap = 40) {
  const s = start.slice(), n = s.length;
  let d = deviation(countColors(s), ideal), steps = 0;
  while (d > 0 && steps < cap) {
    let best = Infinity, picks = [];
    for (let i = 0; i < n; i++) {
      applyClick(s, affected, i);
      const nd = deviation(countColors(s), ideal);
      applyClick(s, affected, i, -1);
      if (nd < best) { best = nd; picks = [i]; } else if (nd === best) picks.push(i);
    }
    if (best < d) {
      applyClick(s, affected, picks[Math.floor(rng() * picks.length)]); d = best; steps++; continue;
    }
    let best2 = Infinity, pair = null;
    for (let i = 0; i < n; i++) {
      applyClick(s, affected, i);
      for (let j = 0; j < n; j++) {
        applyClick(s, affected, j);
        const nd = deviation(countColors(s), ideal);
        applyClick(s, affected, j, -1);
        if (nd < best2) { best2 = nd; pair = [i, j]; }
      }
      applyClick(s, affected, i, -1);
    }
    if (best2 < d) { applyClick(s, affected, pair[0]); applyClick(s, affected, pair[1]); d = best2; steps += 2; }
    else { applyClick(s, affected, picks[Math.floor(rng() * picks.length)]); d = best; steps++; }
  }
  return steps;
}
function gradeOf({ counts, ideal, n, steps, ref }) {
  const d = deviation(counts, ideal);
  const lo = Math.ceil(n * 0.15), hi = Math.floor(n * 0.25);
  const inBand = counts.every(c => c >= lo && c <= hi);
  if (d === 0 && steps <= ref) return 'SS+';
  if (d === 0 && steps <= ref * 2) return 'SS';
  if (inBand) return 'S';
  if (d <= 6) return 'A';
  if (d <= 10) return 'B';
  if (d <= 14) return 'C';
  if (d <= 18) return 'D';
  return 'E';
}
// 隱藏分數：只存在 localStorage，用來排序紀錄
function hiddenScore({ counts, ideal, steps, ref, time }) {
  const d = deviation(counts, ideal);
  const s = 1000 - 40 * d - 15 * (steps - ref) + Math.round(CONFIG.TIME_LIMIT - time);
  return Math.max(0, s);
}

/* ===================== 介面 ===================== */
if (typeof document !== 'undefined') (function () {
  const $ = id => document.getElementById(id);
  const board = $('board');
  const cellEls = Array.from(board.querySelectorAll('.cell'));
  const N = cellEls.length;
  const IDEAL = idealCounts(N);
  const LO = Math.ceil(N * 0.15), HI = Math.floor(N * 0.25);

  // 圓角（用屬性設定，舊版 Safari 也支援）
  board.querySelectorAll('rect').forEach(r => r.setAttribute('rx', 7));

  // 由 data-r / data-c 建立鄰接表：affected[i] = 自己 + 上下左右
  const index = new Map(cellEls.map((el, i) => [el.dataset.r + ',' + el.dataset.c, i]));
  const affected = cellEls.map((el, i) => {
    const r = +el.dataset.r, c = +el.dataset.c, list = [i];
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const j = index.get((r + dr) + ',' + (c + dc));
      if (j !== undefined) list.push(j);
    });
    return list;
  });

  const store = {
    load() { try { return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || []; } catch (e) { return []; } },
    save(list) { try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(list)); } catch (e) {} },
  };

  let game = null, timer = null;
  const SUBMIT_TEXT = { playing: $('submitBtn').textContent, done: '看市民滿意度' };
  const RESTART_TEXT = { playing: $('restartBtn').textContent, done: '重啟遊戲' };

  /* ---------- 彈出卡片的分頁：點分頁、左右滑動、方向鍵都能切換 ---------- */
  function makePager(sheet, onChange) {
    const tabs = Array.from(sheet.querySelectorAll('.tab'));
    const pager = sheet.querySelector('.pager');
    const track = sheet.querySelector('.track');
    const pages = Array.from(sheet.querySelectorAll('.page'));
    let cur = 0;
    function refresh() { pager.style.height = pages[cur].offsetHeight + 'px'; }
    function go(i, animate = true) {
      cur = Math.max(0, Math.min(pages.length - 1, i));
      if (!animate) { track.style.transition = 'none'; pager.style.transition = 'none'; }
      track.style.transform = `translateX(${-cur * 100}%)`;
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === cur)); t.tabIndex = k === cur ? 0 : -1; });
      pages.forEach((pg, k) => { pg.inert = k !== cur; });
      refresh();
      if (!animate) { void track.offsetWidth; track.style.transition = ''; pager.style.transition = ''; }
      if (onChange) onChange(cur);
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => go(i));
      t.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); go(cur + d); tabs[cur].focus(); }
      });
    });
    let sx = 0, sy = 0;
    track.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    track.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(cur + (dx < 0 ? 1 : -1));
    }, { passive: true });
    window.addEventListener('resize', refresh);
    return { go, refresh, get index() { return cur; } };
  }
  const SHARE_PAGE = 1;
  const startPager = makePager($('startPanel'));
  const resultPager = makePager($('resultModal'), i => { if (i === SHARE_PAGE) prepareShareImage(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { startPager.refresh(); resultPager.refresh(); });

  function newSeed() { return Math.random().toString(36).slice(2, 8); }
  function readSeedFromUrl() {
    try { return new URLSearchParams(location.search).get('seed'); } catch (e) { return null; }
  }
  function setUrlSeed(seed) {
    try { const u = new URL(location.href); u.searchParams.set('seed', seed); history.replaceState(null, '', u); } catch (e) {}
  }
  // 分享用的連結：先到評價分享頁（讓社群平台抓到對應圖片），再自動跳回遊戲
  function shareLink(seed, grade) {
    try {
      const u = new URL(`share/${GRADE_SLUGS[grade] || 'e'}.html`, location.href);
      u.search = ''; u.hash = ''; u.searchParams.set('seed', seed);
      return u.href;
    } catch (e) { return challengeUrl(seed); }
  }
  function challengeUrl(seed) {
    try { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('seed', seed); return u.href; }
    catch (e) { return location.href; }
  }

  function setup(seed, fromFriend) {
    clearInterval(timer);
    const { state, rng } = makeStartState(seed, N);
    const ref = referenceSteps(state, affected, IDEAL, rng);
    game = { seed, state, ref, steps: 0, startAt: 0, elapsed: 0, phase: 'ready', rerolls: 0, policy: 0 };
    setUrlSeed(seed);
    render();
    $('timeVal').textContent = CONFIG.TIME_LIMIT;
    $('timeStat').classList.remove('low');
    $('startPanel').hidden = false;
    $('seedNote').hidden = !fromFriend;
    startPager.go(0, false);
    $('submitBtn').hidden = true;
    $('submitBtn').textContent = SUBMIT_TEXT.playing;
    $('restartBtn').textContent = RESTART_TEXT.playing;
    board.classList.remove('playing', 'locked');
  }

  function start() {
    $('startPanel').hidden = true;
    board.classList.add('playing');
    game.phase = 'playing';
    game.startAt = performance.now();
    timer = setInterval(tick, 100);
  }

  function tick() {
    game.elapsed = (performance.now() - game.startAt) / 1000;
    const left = Math.max(0, CONFIG.TIME_LIMIT - game.elapsed);
    $('timeVal').textContent = Math.ceil(left);
    $('timeStat').classList.toggle('low', left <= 10);
    if (game.elapsed >= CONFIG.SUBMIT_AFTER) $('submitBtn').hidden = false;
    if (left <= 0) finish();
  }

  function render() {
    cellEls.forEach((el, i) => el.setAttribute('class', 'cell c' + game.state[i]));
    const counts = countColors(game.state);
    $('stepVal').textContent = game.steps;
    const g = game.phase === 'ready' ? null : gradeOf({ counts, ideal: IDEAL, n: N, steps: game.steps, ref: game.ref });
    $('gradeVal').textContent = g ? gradeLabel(g) : '–';
    $('gradeVal').dataset.grade = g || '';
    const spans = $('bar').querySelectorAll('span');
    counts.forEach((c, i) => { spans[i].style.flexBasis = (c / N * 100) + '%'; });
    $('legend').innerHTML = counts.map((c, i) =>
      `<div><i class="sw" style="background:var(--c${i})"></i><span class="count${c >= IDEAL[4] && c <= IDEAL[0] ? ' ok' : ''}">${c}</span><span>${COLORS[i].name} ${Math.round(c / N * 100)}%</span></div>`
    ).join('');
    return counts;
  }

  board.addEventListener('click', e => {
    if (!game || game.phase !== 'playing') return;
    const i = cellEls.indexOf(e.target);
    if (i < 0) return;
    applyClick(game.state, affected, i);
    game.steps++;
    render();
    affected[i].forEach(k => {
      const el = cellEls[k];
      el.classList.remove('bump'); void el.getBoundingClientRect(); el.classList.add('bump');
    });
  });

  function finish() {
    if (game.phase !== 'playing') return;
    clearInterval(timer);
    game.elapsed = Math.min(CONFIG.TIME_LIMIT, (performance.now() - game.startAt) / 1000);
    game.phase = 'done';
    board.classList.remove('playing'); board.classList.add('locked');
    // 結算後按鈕留著：關掉結果視窗後還能再叫出來
    $('submitBtn').hidden = false;
    $('submitBtn').textContent = SUBMIT_TEXT.done;
    $('restartBtn').textContent = RESTART_TEXT.done;

    const counts = countColors(game.state);
    const time = Math.round(game.elapsed * 10) / 10;
    const grade = gradeOf({ counts, ideal: IDEAL, n: N, steps: game.steps, ref: game.ref });
    const score = hiddenScore({ counts, ideal: IDEAL, steps: game.steps, ref: game.ref, time });
    Object.assign(game, { counts, time, grade, score });

    const list = store.load();
    game.recordDate = new Date().toISOString();
    list.push({ grade, score, steps: game.steps, time, seed: game.seed, date: game.recordDate });
    list.sort((a, b) => b.score - a.score);
    store.save(list.slice(0, CONFIG.RECORDS_KEPT));
    renderRecords();

    // 政見：最接近 20% 的顏色，同分隨機
    const target = N / 5;
    const gaps = counts.map(c => Math.abs(c - target));
    const minGap = Math.min(...gaps);
    const cands = gaps.map((g, i) => [g, i]).filter(([g]) => g - minGap < 1e-9).map(([, i]) => i);
    game.policy = cands[Math.floor(Math.random() * cands.length)];
    game.policyReason = 'closest';
    game.rerolls = 0;

    $('resultGrade').textContent = gradeLabel(grade);
    $('resultGrade').dataset.grade = grade;
    $('resultSteps').textContent = game.steps;
    $('resultTime').textContent = time.toFixed(1);
    $('resultNote').textContent = citizenComment(grade, game.steps, game.ref);
    $('toast').textContent = '';
    renderPolicy();
    resetShare();
    openResult();
  }

  function renderPolicy() {
    const p = POLICIES[game.policy];
    $('policyDot').style.background = `var(--c${game.policy})`;
    $('policyArea').textContent = `${p.area}・${p.tag}`;
    $('policyTitle').textContent = p.title;
    $('policyText').textContent = p.text;
    $('policyWhy').textContent = game.policyReason === 'closest'
      ? `你的台北裡，${COLORS[game.policy].name}色最接近 20%。`
      : '這是你換到的政見。';
    const left = CONFIG.REROLL_LIMIT - game.rerolls;
    $('rerollBtn').disabled = left <= 0;
    $('rerollBtn').textContent = left > 0 ? `換一則政見（剩 ${left} 次）` : '已經換過了';
  }

  $('rerollBtn').addEventListener('click', () => {
    if (game.rerolls >= CONFIG.REROLL_LIMIT) return;
    const others = [0, 1, 2, 3, 4].filter(i => i !== game.policy);
    game.policy = others[Math.floor(Math.random() * others.length)];
    game.policyReason = 'reroll';
    game.rerolls++;
    renderPolicy();
    resetShare();
    resultPager.refresh();
  });

  function renderRecords() {
    const list = store.load();
    const latest = game && game.recordDate;
    const html = list.length
      ? list.map((r, k) => {
          const d = new Date(r.date);
          const date = r.date === latest ? '剛剛' : isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
          return `<li${r.date === latest ? ' class="latest"' : ''}><span class="rank">${k + 1}</span><span class="g" data-grade="${r.grade}">${gradeLabel(r.grade)}</span><span class="meta">${r.steps} 次點擊・${Number(r.time).toFixed(1)} 秒</span><span class="meta">${date}</span></li>`;
        }).join('')
      : '<li class="empty">還沒有紀錄，玩一局就會出現在這裡。</li>';
    document.querySelectorAll('.record-list').forEach(el => { el.innerHTML = html; });
    if (latest && !list.some(r => r.date === latest)) {
      document.querySelectorAll('#resultModal .record-list').forEach(el => {
        el.insertAdjacentHTML('beforeend', '<li class="empty">這局沒有進入前 5 名，再接再厲！</li>');
      });
    }
  }

  /* ---------- 分享圖片 ---------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    const lines = []; let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }
  async function drawShareImage() {
    try { await Promise.all([document.fonts.load('900 40px "Noto Sans TC"'), document.fonts.load('700 40px "TASA Explorer"')]); } catch (e) {}
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const body = '"TASA Explorer", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    const disp = '"TASA Explorer", "Noto Sans TC", sans-serif';
    ctx.fillStyle = '#eaf3fa'; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#587087'; ctx.font = `700 30px ${disp}`; ctx.fillText('TAIPEI N.E.W.S.', 72, 104);
    ctx.fillStyle = '#1c2b3a'; ctx.font = `900 64px ${body}`; ctx.fillText('我的台北色彩', 72, 178);

    // 地圖
    const rows = +board.dataset.rows, cols = +board.dataset.cols;
    const size = 58, bx = 72, by = 240;
    board.querySelectorAll('.blank').forEach(el => {
      ctx.fillStyle = '#d8e7f3'; roundRect(ctx, bx + el.dataset.c * size + 3, by + el.dataset.r * size + 3, size - 6, size - 6, 9); ctx.fill();
    });
    cellEls.forEach((el, i) => {
      ctx.fillStyle = COLORS[game.state[i]].hex; roundRect(ctx, bx + el.dataset.c * size + 3, by + el.dataset.r * size + 3, size - 6, size - 6, 9); ctx.fill();
    });

    // 右欄：評價與數據
    const rx = bx + cols * size + 40;
    ctx.fillStyle = '#587087'; ctx.font = `500 26px ${body}`; ctx.fillText('市民滿意度', rx, 290);
    ctx.fillStyle = '#1c2b3a';
    const label = gradeLabel(game.grade), maxW = W - 72 - rx;
    let fs = 76;
    do { ctx.font = `900 ${fs}px ${body}`; fs -= 2; } while (ctx.measureText(label).width > maxW && fs > 30);
    ctx.fillText(label, rx, 400);
    ctx.font = `700 54px ${disp}`; ctx.fillText(String(game.steps), rx, 530);
    ctx.fillStyle = '#587087'; ctx.font = `500 24px ${body}`; ctx.fillText('次點擊', rx, 566);
    ctx.fillStyle = '#1c2b3a'; ctx.font = `700 54px ${disp}`; ctx.fillText(game.time.toFixed(1), rx, 656);
    ctx.fillStyle = '#587087'; ctx.font = `500 24px ${body}`; ctx.fillText('秒', rx, 692);
    game.counts.forEach((c, i) => {
      const y = 750 + i * 46;
      ctx.fillStyle = COLORS[i].hex; roundRect(ctx, rx, y, 28, 28, 6); ctx.fill();
      ctx.fillStyle = '#1c2b3a'; ctx.font = `700 26px ${body}`;
      ctx.fillText(`${Math.round(c / N * 100)}%`, rx + 42, y + 25);
    });

    // 政見
    const p = POLICIES[game.policy], py = by + rows * size + 50;
    ctx.fillStyle = '#ffffff'; roundRect(ctx, 72, py, W - 144, H - py - 110, 24); ctx.fill();
    ctx.fillStyle = COLORS[game.policy].hex; roundRect(ctx, 108, py + 38, 26, 26, 6); ctx.fill();
    ctx.fillStyle = '#587087'; ctx.font = `700 26px ${body}`; ctx.fillText(`${p.area}・${p.tag}`, 148, py + 61);
    ctx.fillStyle = '#1c2b3a'; ctx.font = `900 44px ${body}`; ctx.fillText(p.title, 108, py + 124);
    ctx.font = `400 28px ${body}`;
    wrapText(ctx, p.text, W - 216).slice(0, 3).forEach((l, k) => ctx.fillText(l, 108, py + 176 + k * 42));

    ctx.fillStyle = '#587087'; ctx.font = `400 22px ${body}`;
    ctx.fillText('支持者自製・非官方競選網站', 72, H - 52);
    ctx.textAlign = 'right'; ctx.fillText(`挑戰同一張地圖：盤面 ${game.seed}`, W - 72, H - 52);
    return cv;
  }

  /* ---------- 分享頁 ---------- */
  function shareText() { return `我規劃的台北，市民的反應是「${gradeLabel(game.grade)}」！一起來挑戰同一張地圖：`; }
  function shareFileName() { return `taipei-colors-${game.seed}.png`; }
  const canShareFiles = (() => {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] })); }
    catch (e) { return false; }
  })();

  // 結果或政見改變時，清掉舊圖並更新連結
  function resetShare() {
    if (game.shareUrl) URL.revokeObjectURL(game.shareUrl);
    game.shareBlob = null; game.shareUrl = null; game.shareJob = null;
    $('shareImg').hidden = true; $('shareImg').removeAttribute('src');
    $('shareImgNote').textContent = '正在產生圖片…';
    $('shareImgBtn').hidden = !canShareFiles;
    const url = shareLink(game.seed, game.grade), text = shareText(), enc = encodeURIComponent;
    $('shareThreads').href = `https://www.threads.net/intent/post?text=${enc(text + ' ' + url)}`;
    $('shareFacebook').href = `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
    $('shareX').href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
    $('shareLine').href = `https://social-plugins.line.me/lineit/share?url=${enc(url)}&text=${enc(text)}`;
  }
  function prepareShareImage() {
    if (!game.shareJob) {
      game.shareJob = drawShareImage()
        .then(cv => new Promise(res => cv.toBlob(res, 'image/png')))
        .then(blob => {
          game.shareBlob = blob; game.shareUrl = URL.createObjectURL(blob);
          const img = $('shareImg');
          img.onload = () => resultPager.refresh();
          img.src = game.shareUrl; img.hidden = false;
          $('shareImgNote').textContent = canShareFiles ? '可以直接分享圖片，或先儲存下來。' : '長按或右鍵也可以儲存圖片。';
          return blob;
        })
        .catch(() => { $('shareImgNote').textContent = '這個瀏覽器無法產生圖片，請改用截圖。'; game.shareJob = null; });
    }
    return game.shareJob;
  }

  $('toShareBtn').addEventListener('click', () => resultPager.go(SHARE_PAGE));

  $('shareImgBtn').addEventListener('click', async () => {
    const blob = game.shareBlob || await prepareShareImage();
    if (!blob) return;
    try {
      const file = new File([blob], shareFileName(), { type: 'image/png' });
      await navigator.share({ files: [file], text: shareText() + ' ' + shareLink(game.seed, game.grade) });
    } catch (e) {
      if (!e || e.name !== 'AbortError') $('toast').textContent = '分享沒有成功，可以改用「儲存圖片」。';
    }
  });

  $('saveImgBtn').addEventListener('click', async () => {
    const blob = game.shareBlob || await prepareShareImage();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = game.shareUrl; a.download = shareFileName();
    document.body.appendChild(a); a.click(); a.remove();
    $('toast').textContent = '圖片已儲存。';
  });

  $('copyBtn').addEventListener('click', () => {
    const url = shareLink(game.seed, game.grade);
    const done = () => { $('toast').textContent = '挑戰連結已複製，朋友會拿到同一張地圖。'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, () => { $('toast').textContent = url; });
    } else $('toast').textContent = url;
  });

  $('startBtn').addEventListener('click', start);
  /* ---------- 結果視窗的開關 ---------- */
  function openResult() {
    $('toast').textContent = '';
    $('resultModal').hidden = false;
    resultPager.go(0, false);
    $('toShareBtn').focus();
  }
  function closeResult() {
    if ($('resultModal').hidden) return;
    $('resultModal').hidden = true;
    $('submitBtn').focus();
  }
  // 點視窗外的半透明區域或按 Esc 關閉，回去看自己的地圖
  $('resultModal').addEventListener('click', e => { if (e.target === $('resultModal')) closeResult(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeResult(); });
  $('closeResultBtn').addEventListener('click', closeResult);

  $('submitBtn').addEventListener('click', () => { if (game.phase === 'done') openResult(); else finish(); });
  $('restartBtn').addEventListener('click', () => setup(newSeed(), false));
  $('againBtn').addEventListener('click', () => { $('resultModal').hidden = true; setup(newSeed(), false); });

  const urlSeed = readSeedFromUrl();
  setup(urlSeed || newSeed(), !!urlSeed);
  renderRecords();
})();
