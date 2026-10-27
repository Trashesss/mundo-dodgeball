// 사이트 동접자: 페이지를 열어 둔 동안 서버에 가벼운 연결을 하나 유지하고 접속자 수를 받는다.
// 나 말고 한 명이라도 더 있으면 빠른 대전 카드 설명 자리에 나를 뺀 접속자 수를 띄운다.
// 서버에 연결할 수 없으면 원래 설명으로 돌리고 점점 길게 기다렸다가 다시 붙는다.
import { serverUrl } from './online.js';

const $ = (id) => document.getElementById(id);
const RETRY_MS = [2000, 5000, 15000, 30000];
const DEFAULT_TEXT = '모르는 상대와 바로 한 판';

function show(count) {
  const el = $('quick-description');
  const others = count - 1;
  if (others < 1) { el.textContent = DEFAULT_TEXT; return; }
  const num = document.createElement('span');
  num.className = 'online-count-num';
  num.textContent = `${others}명`;
  el.replaceChildren('지금 ', num, ' 접속 중');
}

export function initPresence() {
  let tries = 0;
  const retry = () => setTimeout(open, RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)]);
  const open = () => {
    let ws;
    try { ws = new WebSocket(serverUrl()); } catch { retry(); return; }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ type: 'presence' })); };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg?.type === 'online' && Number.isFinite(msg.count)) show(msg.count);
    };
    ws.onclose = () => { show(0); retry(); };
  };
  open();
}
