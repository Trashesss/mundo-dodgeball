// 플레이 가능 환경 확인: 터치 전용 기기는 PC 안내, 작은 창은 화면 전체를 덮어 창을 키우도록 안내한다
import { track } from './analytics.js';

// 메뉴가 맞는 가장 작은 PC 창(800×600)보다 조금 낮게 잡는다
const MIN_W = 800, MIN_H = 560;
const $ = (id) => document.getElementById(id);

// 마우스·트랙패드가 하나라도 있으면 통과 (마우스를 연결한 태블릿, 터치 노트북)
export const isTouchOnly = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
export const fitsScreen = () => innerWidth >= MIN_W && innerHeight >= MIN_H;

let pending = null;

export function showMobileGate() {
  $('mobile-gate').classList.remove('hidden');
  track('mobile_gate_shown');
  const button = $('mobile-gate-copy');
  button.addEventListener('click', async () => {
    const url = location.href;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, url });
          return;
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(url);
      $('mobile-gate-status').textContent = '링크를 복사했어요! PC에서 열어 주세요.';
    } catch {
      $('mobile-gate-status').textContent = '복사하지 못했어요. 주소창의 링크를 PC로 옮겨 주세요.';
    }
  });
}

// 창이 충분히 크면 바로 실행하고, 작으면 창을 키우는 순간 실행한다 (초대 링크 입장)
export function guardPlay(action) {
  if (fitsScreen()) return action();
  pending = action;
}

// 작은 창 안내는 모달 dialog 라 메뉴·상점 같은 다른 창보다 위에 뜨고 뒤쪽 조작을 막는다
export function initPlayGate() {
  const gate = $('small-screen-gate');
  const update = () => {
    if (fitsScreen()) {
      if (!gate.open) return;
      gate.close();
      const action = pending;
      pending = null;
      action?.();
    } else if (!gate.open) {
      gate.showModal();
      track('small_screen_blocked', { width: innerWidth, height: innerHeight });
    }
  };
  // Escape 로 닫히지 않게 한다. 그래도 닫히면 창이 작은 동안 다시 띄운다.
  gate.addEventListener('cancel', (event) => event.preventDefault());
  gate.addEventListener('close', () => requestAnimationFrame(update));
  addEventListener('resize', update);
  update();
}
