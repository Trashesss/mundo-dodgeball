export const DIFFICULTY_NAMES = {
  easy: '쉬움', normal: '보통', hard: '어려움', faker: '페이커', twins: '쌍둥이',
};

export const GAME_DESCRIPTION = '날아오는 식칼을 피하고, 상대 문도를 쓰러뜨리는 피구 게임';

export function shareContent(difficulty, win) {
  const heading = `${DIFFICULTY_NAMES[difficulty]} 난이도 ${win ? '클리어!' : '실패'}`;
  return { heading, description: GAME_DESCRIPTION, title: `[문도 피구] ${heading}`, text: `[문도 피구] ${heading}` };
}

// 친구와 1대1 승자가 보내는 굴욕 공유. 미리보기는 고정 짤, 상대 이름은 복사 문구에만 들어간다.
export const HUMILIATE_PATH = 'share/humiliate.html';
export const HUMILIATE_TITLE = '넌 발로해도 이긴다 ㅋ';
export const HUMILIATE_NAME_MAX = 12;

export function humiliateText(name = '') {
  const trimmed = Array.from(name.replace(/\s+/g, ' ').trim()).slice(0, HUMILIATE_NAME_MAX).join('').trim();
  return trimmed ? `${trimmed}? 발로 해도 이긴다 ㅋ` : '넌 발로 해도 이긴다 ㅋ';
}
