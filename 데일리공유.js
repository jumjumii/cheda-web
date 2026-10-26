// ──── ☁ 데일리리포트 공유 (2026-10-26) ────
// 화면·기능은 원본 생성기 그대로. 이 파일이 하는 일:
//  1) 원본 스크립트를 비공개 시트의 설정(계정 번호 등)으로 채워서 실행 — 공개 코드엔 계정 번호가 없다(데일리만들기.py).
//  2) 날짜별 저장(💾)을 시트에도 쓰고, 열 때 팀원 저장분을 받아 온다. 시트 행: brand=gs/ht/bt, kind='daily', media='in#n'.
//  3) 📤 엑셀로 보내기 → 시트에 올림(kind='xl'). 엑셀 PC의 데일리_엑셀기입.py가 받아 팀 엑셀에 넣는다.
//  4) 파일로 넣는 매체(메타·네이버·GFA·카카오·틱톡·크리테오)도 행을 직접 고칠 수 있게(✏ 직접 수정).
//  5) 쿠팡 칸 머리줄 정렬, 6) 실시간 최종값과 대조(너무 낮으면 빨강).
const RTDB = (() => { try { return JSON.parse(localStorage.getItem('rt_db') || 'null'); } catch (e) { return null; } })() || {};
const DL_PFX = { granny: 'gs_rd_', hattke: 'ht_rd_', basetune: 'bt_rd_' };
const DL_RT = { granny: 'graniesalad', hattke: 'hattke', basetune: 'basetune' };   // 실시간 리포트 브랜드 키
const DL_KEY = /^(gs|ht|bt)_rd_in_(\d{4}-\d{2}-\d{2})$/;
const DL_DAYS = 62;              // 이만큼 최근 날짜만 주고받음(브라우저 저장공간 보호)
const DL_CHUNK = 30000;          // 시트 칸 한도(5만 자) 아래로 쪼갬
const _lsSet = Storage.prototype.setItem;
const dlWho = () => { try { return localStorage.getItem('rt_db_who') || '웹'; } catch (e) { return '웹'; } };
const dlYmd = dt => new Date(dt.getTime() + 9 * 3600e3).toISOString().slice(0, 10);   // KST 날짜
const dlSince = () => dlYmd(new Date(Date.now() - DL_DAYS * 864e5));

async function dbCall(body) {
  if (!RTDB.url) throw new Error('공유저장 미설정');
  const r = await fetch(RTDB.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: RTDB.token }, body)) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
function dlBadge(txt, ok) {
  let b = document.getElementById('dl-badge');
  if (!b) {
    b = document.createElement('div'); b.id = 'dl-badge';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;padding:6px 10px;border-radius:16px;border:1px solid #ddd;background:#fff;font:12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.12)';
    document.body.appendChild(b);
  }
  b.textContent = '☁ ' + txt; b.style.color = ok ? '#15803d' : '#b91c1c';
}
// 큰 값은 조각으로: [{media: base+'#i', value:{n,i,s}}]
const dlSplit = (base, v) => {
  const s = v == null ? '' : JSON.stringify(v), n = Math.max(1, Math.ceil(s.length / DL_CHUNK));
  return [...Array(n)].map((_, i) => ({ media: base + '#' + i, value: v == null ? null : { n, i, s: s.slice(i * DL_CHUNK, (i + 1) * DL_CHUNK) } }));
};
function dlJoin(rows) {           // 같은 (brand,date,kind,base) 조각들 → 값. 0번 조각의 n만큼 모이면 완성
  const by = {};
  rows.forEach(r => { const [base, i] = String(r.media).split('#'); (by[r.brand + '|' + r.date + '|' + r.kind + '|' + base] ||= [])[+i] = r; });
  const out = [];
  Object.values(by).forEach(a => {
    const h = a[0]; if (!h) return;
    if (!h.value) { out.push({ brand: h.brand, date: h.date, kind: h.kind, base: h.media.split('#')[0], value: null, at: h.at, by: h.by }); return; }
    const parts = a.slice(0, h.value.n); if (parts.length < h.value.n || parts.some(p => !p || !p.value)) return;
    try { out.push({ brand: h.brand, date: h.date, kind: h.kind, base: h.media.split('#')[0], value: JSON.parse(parts.map(p => p.value.s).join('')), at: h.at, by: h.by }); } catch (e) {}
  });
  return out;
}
async function dlPut(rows) {
  for (let i = 0; i < rows.length; i += 20) await dbCall({ action: 'put', rows: rows.slice(i, i + 20), by: dlWho() });
}

// ── 2) 날짜별 저장 주고받기 ──
async function dlPull(quiet) {
  if (!quiet) dlBadge('팀 저장분 불러오는 중…', true);
  let rows;
  try { rows = (await dbCall({ action: 'get', from: dlSince(), to: '2999-12-31' })).rows.filter(r => r.kind === 'daily'); }
  catch (e) { dlBadge('불러오기 실패 — ' + e.message, false); return 0; }
  const sheet = {};
  dlJoin(rows).forEach(r => { if (DL_PFX[r.brand]) sheet[DL_PFX[r.brand] + 'in_' + r.date] = r.value; });
  let changed = 0;
  Object.entries(sheet).forEach(([k, v]) => {
    const s = v == null ? null : JSON.stringify(v);
    if (s == null) { if (localStorage.getItem(k) != null) { localStorage.removeItem(k); changed++; } }
    else if (localStorage.getItem(k) !== s) { try { _lsSet.call(localStorage, k, s); changed++; } catch (e) {} }
  });
  const up = [];                  // 이 브라우저에만 있는 최근 저장분 → 시트로(예전 기록 이사)
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i), m = k && k.match(DL_KEY);
    if (m && m[2] >= dlSince() && !(k in sheet)) up.push(k);
  }
  if (up.length) { try { await dlPut(up.flatMap(dlRowsOf)); } catch (e) {} }
  dlBadge('팀 저장분 반영 ' + new Date().toTimeString().slice(0, 5), true);
  return changed;
}
function dlRowsOf(k) {
  const m = k.match(DL_KEY), brand = Object.keys(DL_PFX).find(b => DL_PFX[b] === m[1] + '_rd_');
  let v = null; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) {}
  return dlSplit('in', v).map(p => ({ brand, date: m[2], kind: 'daily', media: p.media, value: p.value }));
}
const dlQ = new Set(); let dlT = 0;
function dlQueue(k) {
  dlQ.add(k); clearTimeout(dlT);
  dlT = setTimeout(async () => {
    const ks = [...dlQ]; dlQ.clear();
    try { await dlPut(ks.flatMap(dlRowsOf)); dlBadge('시트에 저장됨 ' + new Date().toTimeString().slice(0, 5), true); }
    catch (e) { dlBadge('시트 저장 실패 — ' + e.message, false); }
  }, 1500);
}
// 원본의 날짜별 저장은 전부 localStorage.setItem(INKEY(날짜))을 지난다 → 거기서 잡는다.
Storage.prototype.setItem = function (k, v) {
  _lsSet.call(this, k, v);
  if (this === localStorage && DL_KEY.test(k)) dlQueue(k);
  if (this === localStorage && AB_KEY.test(k)) abQueue(k);
};

// ── 💰 광고비 충전: 날짜별 시트(ab_state_날짜)·충전 기록(ab_history)도 팀 시트로(2026-10-26) ──
//   시트 행: brand '충전', kind 'ab'(date=그 날짜) / kind 'abh'(date 2000-01-03, 기록 목록 통째)
const AB_KEY = /^(ab_history|ab_state_(\d{4}-\d{2}-\d{2}))$/;
const abRowsOf = k => {
  let v = null; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) {}
  const m = k.match(AB_KEY), d = m[2] || '2000-01-03', kind = m[2] ? 'ab' : 'abh';
  return dlSplit(kind, v).map(p => ({ brand: '충전', date: d, kind, media: p.media, value: p.value }));
};
const abQ = new Set(); let abT = 0;
function abQueue(k) {
  abQ.add(k); clearTimeout(abT);
  abT = setTimeout(async () => {
    const ks = [...abQ]; abQ.clear();
    try { await dlPut(ks.flatMap(abRowsOf)); dlBadge('충전 시트 저장 ' + new Date().toTimeString().slice(0, 5), true); }
    catch (e) { dlBadge('충전 시트 저장 실패 — ' + e.message, false); }
  }, 1500);
}
async function abPull() {
  let rows; try { rows = (await dbCall({ action: 'get', brand: '충전' })).rows; } catch (e) { return; }
  const got = dlJoin(rows), up = [];
  const mine = (() => { try { return JSON.parse(localStorage.getItem('ab_history') || '[]'); } catch (e) { return []; } })();
  const sh = (got.find(r => r.kind === 'abh') || {}).value || [];
  const by = {}; [...sh, ...mine].forEach(h => { if (h && h.date && (!by[h.date] || (h.ts || '') > (by[h.date].ts || ''))) by[h.date] = h; });
  const merged = Object.values(by).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
  _lsSet.call(localStorage, 'ab_history', JSON.stringify(merged));
  if (JSON.stringify(merged) !== JSON.stringify(sh)) up.push('ab_history');
  const shDates = new Set();
  got.filter(r => r.kind === 'ab').forEach(r => { shDates.add(r.date); if (r.value) _lsSet.call(localStorage, 'ab_state_' + r.date, JSON.stringify(r.value)); });
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), m = k && k.match(AB_KEY); if (m && m[2] && !shDates.has(m[2])) up.push(k); }
  if (up.length) try { await dlPut(up.flatMap(abRowsOf)); } catch (e) {}
}

// ── 3) 엑셀로 보내기 → 시트(kind 'xl'). 엑셀 PC가 받아서 넣는다 ──
async function dlAllInOne() {
  const p = window._dlLast;
  try {
    if (!p || !(p.blocks || []).length) throw new Error('보낼 데이터 없음');
    const ts = String(p.ts || Date.now());
    await dlPut(dlSplit(ts, p).map(x => ({ brand: p.brand, date: dlYmd(new Date()), kind: 'xl', media: x.media, value: x.value })));
    return { json: async () => ({ ok: true }) };
  } catch (e) { return { json: async () => ({ ok: false, error: '시트로 못 보냄: ' + e.message }) }; }
}

// ── 4) 파일 매체 직접 수정 ──
function dlEditor() {
  if (typeof PLATFORMS === 'undefined') return;
  Object.keys(PLATFORMS).forEach(key => {
    const card = document.getElementById('dz-' + key)?.closest('.platform-card');
    if (!card || card.querySelector('.dl-edit-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'p-reset dl-edit-btn'; btn.textContent = '✏ 직접 수정'; btn.style.cssText = 'background:#eef2ff;color:#3730a3;border-color:#c7d2fe';
    const box = document.createElement('div'); box.className = 'dl-edit'; box.style.display = 'none';
    btn.onclick = () => { box.style.display = box.style.display === 'none' ? '' : 'none'; if (box.style.display === '') dlEditRender(key, box); };
    card.appendChild(btn); card.appendChild(box);
  });
}
function dlEditRender(key, box) {
  const rows = state.processed[key] = state.processed[key] || [];
  box._rows = rows;
  const cfg = PLATFORMS[key], esc = s => String(s ?? '').replace(/"/g, '&quot;');
  box.innerHTML = '<div style="font-size:10px;color:#888;margin:4px 0">파일로 넣은 행을 고치거나, 파일 없이 직접 넣을 수 있습니다.</div>'
    + rows.map((r, i) => `<div class="dl-er" data-i="${i}"><input type="date" data-f="date" value="${esc(r.date)}"><input data-f="campaign" placeholder="캠페인" value="${esc(r.campaign)}">`
      + ['cost', 'buy', 'rev'].map(f => `<input data-f="${f}" inputmode="decimal" placeholder="${{ cost: '광고비', buy: '구매', rev: '매출' }[f]}" value="${r[f] ?? ''}">`).join('')
      + `<button data-del="${i}">✕</button></div>`).join('')
    + '<button class="dl-add">+ 행 추가</button>';
  box.oninput = e => {
    const el = e.target, i = el.closest('.dl-er')?.dataset.i; if (i == null) return;
    const f = el.dataset.f; rows[i][f] = ['cost', 'buy', 'rev'].includes(f) ? (Number(String(el.value).replace(/[^0-9.-]/g, '')) || 0) : el.value;
    dlEditDone(key, rows);
  };
  box.onclick = e => {
    if (e.target.dataset.del != null) { rows.splice(+e.target.dataset.del, 1); dlEditDone(key, rows); dlEditRender(key, box); }
    if (e.target.classList.contains('dl-add')) {
      const src = cfg.source === 'auto' ? (rows[0]?.source || key) : cfg.source, med = cfg.medium === 'auto' ? (rows[0]?.medium || '') : cfg.medium;
      rows.push({ date: (typeof getFrom === 'function' && getFrom()) || dlYmd(new Date(Date.now() - 864e5)), source: src, medium: med, campaign: '', cost: 0, buy: 0, rev: 0 });
      dlEditRender(key, box);
    }
  };
}
function dlEditDone(key, rows) {
  try { if (rows.length) { setFileSummary(key, rows); document.getElementById('dz-' + key)?.classList.add('loaded'); } else setStat(key, '대기 중', ''); } catch (e) {}
}

// ── 6) 실시간 최종값 대조 — 데일리가 실시간보다 너무 낮으면(수집 누락·오류) 빨갛게 ──
const dlRtCache = {};
async function dlRtOf(brand, d) {
  const k = brand + '|' + d;
  if (!(k in dlRtCache)) {
    dlRtCache[k] = null;
    try {
      const rs = (await dbCall({ action: 'get', brand: DL_RT[brand], from: d, to: d })).rows.filter(r => r.media === 'rec' && r.value);
      const r = rs.find(x => x.kind === 'rt0') || rs.find(x => x.kind === 'rt16');
      dlRtCache[k] = r ? { v: r.value, lab: r.kind === 'rt0' ? '실시간 최종' : '실시간 16시' } : false;
    } catch (e) { delete dlRtCache[k]; }
  }
  return dlRtCache[k];
}
const dlN = v => Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0;
function dlDaily(d) {             // 그 날짜 데일리 값(매체별)
  const pr = k => (state.processed[k] || []).filter(r => r.date === d).reduce((t, r) => t + dlN(r.cost), 0);
  const man = readManualRows(), on = (a, f) => a.filter(r => r.date === d).reduce((t, r) => t + dlN(r[f]), 0);
  const ss = Object.values(state.ssData || {}).filter(x => x && x.date === d).reduce((t, x) => t + dlN(x.rev), 0);
  return { meta: pr('meta'), tiktok: pr('tiktok'), gfa: pr('gfa'), naversa: pr('naver'), kakao: pr('kakao'), google: on(man.gdn, 'cost'),
           cafe24: on(man.c24, 'rev'), coupang: on(man.cp, 'rev'), smartstore: ss };
}
async function dlRtCheck() {
  if (typeof state === 'undefined' || !DL_RT[currentBrand]) return;
  let from = '', to = ''; try { from = getFrom(); to = getTo(); } catch (e) {}
  if (!from || !to || from > to) return;
  const days = []; for (let t = new Date(from + 'T00:00:00Z'); days.length < 31 && t <= new Date(to + 'T00:00:00Z'); t = new Date(t.getTime() + 864e5)) days.push(t.toISOString().slice(0, 10));
  const LAB = { meta: '메타', google: '구글', tiktok: '틱톡', gfa: 'GFA', naversa: '네이버SA', kakao: '카카오', cafe24: '자사몰 순매출', coupang: '쿠팡 매출', smartstore: '스토어 매출' };
  const out = [];
  for (const d of days) {
    const rt = await dlRtOf(currentBrand, d); if (!rt) continue;
    const v = rt.v, rtv = { meta: dlN(v.meta), google: dlN(v.google), tiktok: dlN(v.tiktok), gfa: dlN(v.gfa), naversa: dlN(v.naversa), kakao: dlN(v.kakao),
      cafe24: dlN(v.cafe24Sales) - dlN(v.cafe24Refund), coupang: [1, 2, 3, 4].reduce((t, n) => t + dlN(v['coupang' + n + 'Sales']), 0),
      smartstore: [1, 2, 3].reduce((t, n) => t + dlN(v['ss' + n + 'Sales']), 0) };
    const dv = dlDaily(d);
    Object.keys(LAB).forEach(k => {
      const a = dv[k], b = rtv[k]; if (b < 30000) return;
      const pct = Math.round((a - b) / b * 100), txt = `${d} ${LAB[k]}: 데일리 ${Math.round(a).toLocaleString()} / ${rt.lab} ${Math.round(b).toLocaleString()}`;
      if (a <= 0) out.push(['big', txt + ' — 데일리 값 없음(수집 누락?)']);
      else if (a < b * 0.9) out.push(['big', txt + ` (${pct}%) — 데일리가 너무 낮음`]);
      // 해트케 실시간은 압력이불만 봐서 데일리(전체)가 높은 게 정상 → 높을 때는 나머지 브랜드만, 최종값과 비교할 때만
      else if (currentBrand !== 'hattke' && rt.lab === '실시간 최종' && a > b * 1.5) out.push(['mid', txt + ` (+${pct}%) — 데일리가 많이 높음`]);
    });
  }
  let box = document.getElementById('dl-rtcheck');
  if (!box) { box = document.createElement('div'); box.id = 'dl-rtcheck'; document.querySelector('.wrap')?.prepend(box); }
  box.innerHTML = out.length ? '<b>⚠ 실시간 리포트와 대조</b>' + out.map(([c, t]) => `<div class="dl-${c}">${c === 'big' ? '🔴' : '🟠'} ${t}</div>`).join('') : '';
  box.style.display = out.length ? '' : 'none';
}

// ── 1) 시작: 설정 받기 → 팀 저장분 받기 → 원본 실행 ──
(async function dlBoot() {
  const css = document.createElement('style');
  css.textContent = `
    /* 5) 쿠팡 칸: 머리줄과 아래 칸 폭·여백 맞춤(가로로 넘치면 스크롤) */
    /* 원인: '.mf input.numfmt{110px}'가 뒤의 '.mf input[type=text]{88px}'에 덮여 숫자칸이 88px → 머리줄(110px)과 칸마다 22px씩 어긋남 */
    .mf input[type=text].numfmt{width:110px}
    #coupang-rows .mr{flex-wrap:nowrap;width:max-content}
    #coupang-rows .mf input.cp-minus,#coupang-rows .mf input.cp-net{width:110px}
    #coupang-rows,#coupang-rows+div{max-width:100%}
    .manual-item .mb:has(#coupang-rows){overflow-x:auto}
    .dl-edit{padding:4px 6px 6px;border-top:1px dashed #ddd}
    .dl-er{display:flex;gap:3px;margin-bottom:3px}
    .dl-er input{min-width:0;width:70px;border:1px solid #d0d5dd;border-radius:4px;padding:3px 4px;font-size:11px}
    .dl-er input[data-f=date]{width:112px} .dl-er input[data-f=campaign]{flex:1;width:auto}
    .dl-er button,.dl-add{border:1px solid #ddd;background:#fff;border-radius:4px;font-size:11px;cursor:pointer}
    #dl-rtcheck{margin:0 0 12px;padding:10px 14px;border:2px solid #dc2626;border-radius:10px;background:#fef2f2;font-size:13px;line-height:1.7}
    #dl-rtcheck .dl-big{color:#b91c1c;font-weight:700} #dl-rtcheck .dl-mid{color:#b45309}`;
  document.head.appendChild(css);
  if (!RTDB.url) { document.body.insertAdjacentHTML('afterbegin', '<div style="padding:30px;text-align:center;font:15px sans-serif;color:#b91c1c">통합 사이트 첫 화면에서 비밀번호로 열어 주세요.</div>'); return; }
  dlBadge('설정 불러오는 중…', true);
  let sec = {};
  try { const r = (await dbCall({ action: 'get', brand: '설정', from: '2000-01-01', to: '2000-01-01' })).rows.find(x => x.kind === 'dlcfg'); sec = (r && r.value) || {}; }
  catch (e) { dlBadge('설정 불러오기 실패 — ' + e.message, false); }
  await dlPull(); await abPull();
  document.querySelectorAll('script.dl-src').forEach(s => {
    let t = s.textContent; Object.entries(sec).forEach(([k, v]) => { t = t.split(k).join(v); });
    const n = document.createElement('script'); n.text = t; document.body.appendChild(n);
  });
  document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));
  window.dispatchEvent(new Event('load'));
  // 엑셀로 보내기가 만든 묶음을 잡아 둔다(dlAllInOne이 시트로 올림)
  const wrap = (name, after) => { const f = window[name]; if (typeof f === 'function') window[name] = function () { const r = f.apply(this, arguments); after(r); return r; }; };
  wrap('buildExcelPayload', p => { window._dlLast = p; });
  wrap('buildMultiDatePayload', p => { window._dlLast = p; });
  wrap('generateOnly', () => dlRtCheck());
  const _del = window.deleteSavedDate;      // 날짜 삭제만 시트에도 삭제로(오래된 날짜 자동정리는 시트에 안 퍼뜨림)
  if (typeof _del === 'function') window.deleteSavedDate = function (d) {
    const k = INKEY(d), had = localStorage.getItem(k) != null; _del.apply(this, arguments);
    if (had && localStorage.getItem(k) == null) dlPut(dlSplit('in', null).map(p => ({ brand: currentBrand, date: d, kind: 'daily', media: p.media, value: null })));
  };
  ['cafe24-rows', 'coupang-rows', 'gdn-rows', 'oy-rows'].forEach(id => {    // 머리줄 왼쪽 여백 = 아래 칸(.mr 7px)과 같게
    const h = document.getElementById(id)?.previousElementSibling; if (h) h.style.padding = '0 7px';
  });
  const cpH = document.getElementById('coupang-rows')?.previousElementSibling;
  if (cpH) { cpH.style.width = 'max-content'; cpH.style.flexWrap = 'nowrap'; if (cpH.children[1]) cpH.children[1].style.width = '150px'; }
  setInterval(() => { dlEditor(); dlRtCheck(); }, 4000); dlEditor(); setTimeout(dlRtCheck, 1500);
  setInterval(async () => { if (await dlPull(true)) try { renderDateTabs(); } catch (e) {} }, 5 * 60 * 1000);
})();
