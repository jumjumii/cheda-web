// 🩺 수집 상태 판정 (2026-10-27) — 수집 상태 화면(health.html)과 첫 화면 배너(index.html)가 같이 쓴다.
// 시트에서 최근 데이터 행(col·rt·gads·rocket)과 PC 점검 행(설정/2000-01-10/health)을 읽어 항목별 🟢🟡🔴 판정.
async function healthCheck() {
  const c = JSON.parse(localStorage.getItem('rt_db') || '{}');
  const get = async b => {
    const r = await (await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: c.token, action: 'get' }, b)) })).json();
    if (r.error) throw new Error(r.error); return r.rows;
  };
  const kst = new Date(Date.now() + 9 * 3600e3), ymd = d => d.toISOString().slice(0, 10);
  const today = ymd(kst), yday = ymd(new Date(kst - 864e5)), hour = kst.getUTCHours() + kst.getUTCMinutes() / 60;
  const ageH = s => s ? (Date.now() - new Date(String(s).replace(' ', 'T') + (/[zZ+]/.test(s) ? '' : '+09:00'))) / 3600e3 : 1e9;
  const fmt = s => s ? String(s).replace('T', ' ').slice(0, 16) : '없음';
  const [hl, recent] = await Promise.all([get({ brand: '설정', from: '2000-01-10', to: '2000-01-10' }), get({ from: ymd(new Date(kst - 3 * 864e5)), to: today })]);
  const H = Object.fromEntries(hl.filter(r => r.kind === 'health').map(r => [r.media, r.value]));
  const out = [], add = (group, name, last, rule, lv, desc) => out.push({ group, name, last, rule, lv, desc: desc || '' });
  const BN = { granny: '그래니', hattke: '해트케', basetune: '베이스튠', salagris: '샐러그리스', '-': '공통' };

  // 1) 데일리 매체 — 어제 값이 시트(col)에 있나 (클라우드 07:10 또는 PC 수집이 올림)
  const DAILY = { granny: ['메타', '구글', '틱톡', '카페24', '쿠팡'], hattke: ['메타', '구글', '틱톡', '카페24', '쿠팡', '네이버GFA', '카카오'],
                  basetune: ['메타', '구글', '틱톡', '카페24', '쿠팡', '네이버GFA'], '-': ['네이버', '스마트스토어', '크리테오'] };
  Object.entries(DAILY).forEach(([b, ms]) => ms.forEach(m => {
    const rs = recent.filter(r => r.kind === 'col' && r.brand === b && String(r.media).startsWith(m + '|' + yday + '|' + yday + '#'));
    const due = m === '크리테오' ? 10 : 9.5;
    if (rs.length) add('데일리(어제 ' + yday.slice(5) + ')', BN[b] + ' ' + m, fmt(rs[0].at), '다음 날 아침', 'ok');
    else add('데일리(어제 ' + yday.slice(5) + ')', BN[b] + ' ' + m, '없음', '다음 날 ' + (m === '크리테오' ? '10시' : '9시 반') + '까지',
             hour >= due ? 'bad' : 'warn', hour >= due ? '어제 값이 아직 없음 — 수집 실패 또는 PC 꺼짐' : '아직 수집 시간 전');
  }));
  // 2) 구글 광고 스크립트 — 매시간 보내야 함
  ['granny', 'basetune', 'hattke', 'salagris'].forEach(b => {
    const r = recent.find(x => x.kind === 'gads' && x.brand === b && x.date === today) || recent.filter(x => x.kind === 'gads' && x.brand === b).sort((p, q) => p.date < q.date ? 1 : -1)[0];
    const u = r && r.value && r.value.updated, a = ageH(u);
    add('구글 광고 스크립트', BN[b], fmt(u), '1시간마다', a < 2 ? 'ok' : 'bad', a < 2 ? '' : '스크립트가 2시간 넘게 안 돎 — 구글 광고 스크립트 빈도(매시간) 확인');
  });
  // 3) 실시간 12·16시
  ['graniesalad', 'basetune', 'hattke', 'salagris'].forEach(b => [['rt12', 12.3], ['rt16', 16.3]].forEach(([k, t]) => {
    const r = recent.find(x => x.kind === k && x.brand === b && x.date === today && x.value);
    if (hour < t) return;
    add('실시간(오늘)', (BN[b] || '그래니') + ' ' + k.slice(2) + '시', r ? fmt(r.at) : '없음', k.slice(2) + '시 직후', r ? 'ok' : 'warn', r ? '' : '오늘 ' + k.slice(2) + '시 기록 없음 — PC 꺼짐 또는 수집 실패');
  }));
  // 4) 로켓재고
  const rk = recent.filter(x => x.kind === 'rocket').sort((p, q) => p.date < q.date ? 1 : -1)[0];
  add('쿠팡 로켓재고', '재고·판매', rk ? fmt(rk.value && rk.value.generated) : '없음', '매일 아침',
      rk && rk.date === today ? 'ok' : (hour >= 10 ? 'bad' : 'warn'), rk && rk.date === today ? '' : '오늘 갱신 안 됨');
  // 5) PC 점검(쿠키·카페24 토큰·가설 프로그램·클라우드·스토어 정확도) — PC가 30분마다 올림
  const chk = H.cookies && H.cookies.checked;
  if (ageH(chk) > 2) add('PC 점검', '상태 점검 자체', fmt(chk), '30분마다', 'warn', 'PC 점검이 2시간 넘게 안 옴 — PC 꺼짐(밤이면 정상)');
  Object.entries((H.cookies && H.cookies.data) || {}).forEach(([k, v]) => {
    if (k === '구글') return add('로그인(쿠키)', '구글', fmt(v.at), '—', 'ok', '구글은 광고 스크립트로 받음 — 쿠키 불필요');
    const ads = /광고센터 죽음/.test(v.note || '');
    add('로그인(쿠키)', k, fmt(v.at), '살아 있어야 함', !v.ok ? 'bad' : ads ? 'warn' : 'ok',
        !v.ok ? '로그인 끊김 — 다시 로그인 필요' : ads ? '판매는 됨 · 광고센터 로그인 끊김(광고비는 PC가 채움)' : '');
  });
  Object.entries((H.cafe24 && H.cafe24.data) || {}).forEach(([b, v]) =>
    add('카페24 API 토큰', BN[b] || b, fmt(v.at), '항상 유효', v.ok ? 'ok' : 'bad', v.ok ? '' : (v.note || '토큰 무효') + ' — 관리자 재동의 필요'));
  Object.entries((H.hyp && H.hyp.data) || {}).forEach(([f, t]) =>
    add('가설 프로그램 데이터', f.replace('브랜드자료/', ''), fmt(t), '2일 안', ageH(t) < 48 ? 'ok' : 'bad', ageH(t) < 48 ? '' : '2일 넘게 갱신 안 됨'));
  Object.entries((H.cloud && H.cloud.data) || {}).filter(([w]) => /daily-collect|keepalive/.test(w)).forEach(([w, v]) => {
    const lim = /daily/.test(w) ? 30 : 6, a = ageH(v.at);
    add('클라우드', w, fmt(new Date(new Date(v.at).getTime() + 9 * 3600e3).toISOString()), lim + '시간 안',
        v.conclusion === 'failure' ? 'bad' : a > lim ? 'warn' : 'ok', v.conclusion === 'failure' ? '마지막 실행 실패' : a > lim ? '예약이 제때 안 돎' : '');
  });
  const st = (H.store && H.store.data) || [];
  if (Array.isArray(st) && st.length) add('스마트스토어 정확도', '재수집 비교', st[st.length - 1].split('\t')[0], '매일', st.some(l => /변동/.test(l)) ? 'warn' : 'ok', st.some(l => /변동/.test(l)) ? '다시 받았더니 값이 바뀐 날 있음' : '');
  return out;
}
