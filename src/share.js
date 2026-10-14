export const DIFFICULTY_NAMES = {
  easy: '쉬움', normal: '보통', hard: '어려움', faker: '페이커', twins: '쌍둥이',
};

export const GAME_DESCRIPTION = '날아오는 식칼을 피하고, 상대 문도를 쓰러뜨리는 피구 게임';

export function shareContent(difficulty, win) {
  const heading = `${DIFFICULTY_NAMES[difficulty]} 난이도 ${win ? '클리어!' : '실패'}`;
  return { heading, description: GAME_DESCRIPTION, title: `[문도 피구] ${heading}`, text: `[문도 피구] ${heading}\n${GAME_DESCRIPTION}` };
}
