// 새 공지를 발행할 때 id도 바꾸면 이전 공지를 확인한 사용자에게 다시 표시한다.
export const UPDATE_NOTICE = {
  id: '2026-11-01-mundo-news',
  highlights: [
    {
      tag: '스킨',
      title: 'CEO 문도 등장',
      description: '검정 선글라스에 줄무늬 정장, 파란 넥타이까지. 상점에서 1,000코인으로 만나보세요.',
    },
    {
      tag: '무기',
      title: '내 취향대로 무장',
      description: '식칼 대신 축구공이나 버섯을 던져보세요. 보유한 스킨과 자유롭게 조합할 수 있고, 공격 성능은 같아요.',
    },
    {
      tag: '숙련도',
      title: '한 판마다 쌓이는 경험치',
      description: '승리하면 100 XP, 패배해도 40 XP! 메인 화면의 숙련도에서 나의 문도 레벨을 확인하세요.',
    },
  ],
};

export const UPDATE_NOTICE_STORAGE_KEY = 'mundo-update-notice-v1';
