// 사이트 동접자: 페이지를 열어 둔 동안 서버에 가벼운 연결을 하나 유지하고 접속자 수를 받는다.
// 같은 브라우저의 탭·창 중 한 곳만 연결하고(Web Locks), 받은 수는 다른 탭에 나눠 준다(BroadcastChannel).
// 그래서 서버는 연결 수만 세도 브라우저 하나가 한 명으로 잡힌다. 연결한 탭이 닫히면 기다리던 탭이 이어받는다.
// 나 말고 한 명이라도 더 있으면 빠른 대전 카드 설명 자리에 나를 뺀 접속자 수를 띄운다.
// 서버에 연결할 수 없으면 원래 설명으로 돌리고 점점 길게 기다렸다가 다시 붙는다.
import { serverUrl } from './online.js';

const $ = (id) => document.getElementById(id);
const RETRY_MS = [2000, 5000, 15000, 30000];
const DEFAULT_TEXT = '모르는 상대와 바로 한 판';
const LOCK_NAME = 'mundo-presence';

function show(count) {
  const el = $('quick-description');
  const others = count - 1;
  if (others < 1) { el.textContent = DEFAULT_TEXT; return; }
  const num = document.createElement('span');
  num.className = 'online-count-num';
  num.textContent = `${others}명`;
  el.replaceChildren('지금 ', num, ' 접속 중');
}

function connect(onCount) {
  let tries = 0;
  const retry = () => setTimeout(open, RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)]);
  const open = () => {
    let ws;
    try { ws = new WebSocket(serverUrl()); } catch { retry(); return; }
    ws.onopen = () => { tries = 0; ws.send(JSON.stringify({ type: 'presence' })); };
    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg?.type === 'online' && Number.isFinite(msg.count)) onCount(msg.count);
    };
    ws.onclose = () => { onCount(0); retry(); };
  };
  open();
}

export function initPresence() {
  // 탭끼리 나눠 쓸 수 없는 브라우저는 예전처럼 탭마다 연결한다
  if (!navigator.locks || typeof BroadcastChannel !== 'function') { connect(show); return; }

  const channel = new BroadcastChannel(LOCK_NAME);
  let leading = false;
  let last = 0;
  channel.onmessage = ({ data }) => {
    if (data?.type === 'ask') { if (leading) channel.postMessage({ type: 'online', count: last }); return; }
    if (!leading && data?.type === 'online' && Number.isFinite(data.count)) show(data.count);
  };
  // 이미 연결한 탭이 있으면 지금 수를 받아 온다
  channel.postMessage({ type: 'ask' });

  // 잠금은 이 탭이 닫힐 때까지 놓지 않는다
  navigator.locks.request(LOCK_NAME, () => {
    leading = true;
    connect((count) => {
      last = count;
      show(count);
      channel.postMessage({ type: 'online', count });
    });
    return new Promise(() => {});
  }).catch(() => connect(show));
}
