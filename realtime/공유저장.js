// ──── ☁ 공유 저장(구글 시트, 2026-10-26) ────
// 화면·기능은 원본 그대로. 저장/삭제 때 시트에도 쓰고, 열 때 시트에서 팀 기록을 받아 이 브라우저에 합친다.
// 시트 행: brand=브랜드키, date, kind='rt'+시간(12/16/0), media='rec', value=기록(삭제는 null).
const RTDB = (() => { try { return JSON.parse(localStorage.getItem('rt_db') || 'null'); } catch (e) { return null; } })() || {};
if (location.hash.length > 1) {   // 처음 한 번: 주소 뒤 #URL|TOKEN
  const [u, t] = decodeURIComponent(location.hash.slice(1)).split('|');
  if (u && t) { RTDB.url = u; RTDB.token = t; try { localStorage.setItem('rt_db', JSON.stringify(RTDB)); } catch (e) {} }
  history.replaceState(null, '', location.pathname);
}
async function dbCall(body) {
  if (!RTDB.url) throw new Error('공유저장 미설정');
  const r = await fetch(RTDB.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: RTDB.token }, body)) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j;
}
const dbWho = () => { try { return localStorage.getItem('rt_db_who') || '웹'; } catch (e) { return '웹'; } };
const dbRow = (bk, date, time, rec) => ({ brand: bk, date, kind: 'rt' + time, media: 'rec', value: rec });
function dbBadge(txt, ok) {
  let b = document.getElementById('rtdb-badge');
  if (!b) {
    b = document.createElement('button'); b.id = 'rtdb-badge';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;padding:6px 10px;border-radius:16px;border:1px solid #ddd;background:#fff;font:12px system-ui;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.12)';
    b.onclick = dbSetup; document.body.appendChild(b);
  }
  b.textContent = '☁ ' + txt; b.style.color = ok ? '#15803d' : '#b91c1c';
}
function dbSetup() {
  const u = prompt('공유저장 웹앱 주소(…/exec)', RTDB.url || ''); if (u === null) return;
  const t = prompt('공유저장 비밀값(TOKEN)', RTDB.token || ''); if (t === null) return;
  const w = prompt('내 이름(수정자 표시용)', dbWho()); if (w) try { localStorage.setItem('rt_db_who', w); } catch (e) {}
  RTDB.url = u.trim(); RTDB.token = t.trim();
  try { localStorage.setItem('rt_db', JSON.stringify(RTDB)); } catch (e) {}
  dbPull();
}
async function dbPush(rows) {
  if (!rows.length || !RTDB.url) return;
  try { await dbCall({ action: 'put', rows, by: dbWho() }); dbBadge('저장됨 ' + new Date().toTimeString().slice(0, 5), true); }
  catch (e) { dbBadge('시트 저장 실패 — ' + e.message, false); }
}
// 시트 → 이 브라우저. 시트가 기준(팀 공용). 이 브라우저에만 있는 기록은 시트로 올린다(예전 기록 이사).
async function dbPull() {
  if (!RTDB.url) { dbBadge('공유저장 설정 필요(클릭)', false); return; }
  dbBadge('불러오는 중…', true);
  let rows;
  try { rows = (await dbCall({ action: 'get' })).rows.filter(r => /^rt(12|16|0)$/.test(r.kind) && r.media === 'rec'); }
  catch (e) { dbBadge('불러오기 실패 — ' + e.message, false); return; }
  const to = t => t === '12' ? 1 : t === '16' ? 2 : 3;
  const up = [];
  Object.keys(BRANDS).forEach(bk => {
    let arr = []; try { arr = JSON.parse(localStorage.getItem(BRANDS[bk].key) || '[]'); } catch (e) {}
    const sheet = {}; rows.filter(r => r.brand === bk).forEach(r => { sheet[r.date + '|' + r.kind.slice(2)] = r.value; });
    arr.forEach(x => { if (!(x.date + '|' + x.time in sheet)) up.push(dbRow(bk, x.date, x.time, x)); });
    const keep = arr.filter(x => !(x.date + '|' + x.time in sheet));
    Object.values(sheet).forEach(v => { if (v) keep.push(v); });
    keep.sort((a, b) => a.date !== b.date ? (a.date < b.date ? -1 : 1) : to(a.time) - to(b.time));
    try { localStorage.setItem(BRANDS[bk].key, JSON.stringify(keep)); } catch (e) {}
  });
  loadBrandData(); renderTable(); renderChart(); renderDow();
  if (records.length) updateSummary(records[records.length - 1]);
  dbBadge('팀 기록 반영 ' + new Date().toTimeString().slice(0, 5), true);
  for (let i = 0; i < up.length; i += 200) await dbPush(up.slice(i, i + 200));
}
// 원본 함수에 연결: 저장(rtSync) → 시트에도, 삭제 → 시트에 삭제표시, 자동수집 불러오기 뒤 → 동기화
const _rtSync = rtSync;
rtSync = function (bk, rec) { _rtSync(bk, rec); dbPush([dbRow(bk, rec.date, rec.time, rec)]); };
const _deleteRecord = deleteRecord;
deleteRecord = function (id) {
  const r = records.find(x => x.id === id);
  const before = records.length; _deleteRecord(id);
  if (r && records.length < before) dbPush([dbRow(currentBrand, r.date, r.time, null)]);
};
const _importRtSnapshot = importRtSnapshot;
importRtSnapshot = async function (auto) { await _importRtSnapshot(auto); dbPull(); };
// 공개 코드에서 지운 광고 계정 번호(GFA·SA·카카오 등)는 비공개 시트 '설정' 행에서 받아 채운다(사이트만들기.py가 올림).
async function dbConfig() {
  if (!RTDB.url || typeof RT_COLLECT === 'undefined') return;
  try {
    const r = (await dbCall({ action: 'get', brand: '설정', from: '2000-01-01', to: '2000-01-01' })).rows.find(x => x.kind === 'rtcfg');
    if (!r || !r.value) return;
    Object.keys(r.value).forEach(bk => { if (RT_COLLECT[bk]) Object.assign(RT_COLLECT[bk], r.value[bk]); });
    if (r.value.__cp && typeof RT_CP_ACCOUNTS !== 'undefined') Object.assign(RT_CP_ACCOUNTS, r.value.__cp);   // 쿠팡 계정 목록
    applyBrand(currentBrand);   // 네이버SA 칸 등 계정 유무로 보이는 칸 다시 그림
  } catch (e) {}
}
dbConfig().then(dbPull);
setInterval(dbPull, 5 * 60 * 1000);   // 5분마다 팀원 저장분 반영

// 웹판에선 팀 시트로 자동 반영되므로 '🌙 자동수집 불러오기'는 숨김(2026-10-27)
(function(){ var c=document.createElement("style"); c.textContent="button[onclick^=\"importRtSnapshot\"]{display:none!important}"; document.head.appendChild(c); })();
