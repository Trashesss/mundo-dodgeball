// 온라인 1대1 서버와 브라우저가 공유하는 상수와 상태 압축 형식.
export const NET = {
  TICK_HZ: 60,          // 서버 계산 주기
  SNAP_HZ: 30,          // 스냅샷 전송 주기
  COUNTDOWN_MS: 3000,
  ROUND_END_MS: 3400,   // 결과 연출 (봇전 endT 와 같음)
  GRACE_MS: 15000,      // 연결 끊김 재접속 대기
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // 헷갈리는 0/O, 1/I 제외
  CODE_LEN: 6,
  SPAWN: [{ x: -6.5, z: 0 }, { x: 6.5, z: 0 }],
};

export const isRoomCode = (code) => typeof code === 'string'
  && code.length === NET.CODE_LEN && [...code].every(ch => NET.CODE_CHARS.includes(ch));

const r2 = (v) => Math.round(v * 100) / 100;

// 스냅샷 한 챔피언 = 배열 (JSON 크기를 줄인다)
export function packChamp(c) {
  return [
    r2(c.x), r2(c.z), r2(c.hp), c.alive ? 1 : 0, r2(c.qCd), r2(c.flashCd), r2(c.ghostCd),
    r2(c.ghostT), r2(c.slowT), r2(c.castT), r2(c.actionT), r2(c.facing), c.celebrate ? 1 : 0,
    c.moveTarget ? r2(c.moveTarget.x) : null, c.moveTarget ? r2(c.moveTarget.z) : null,
  ];
}

export function unpackChamp(a) {
  const [x, z, hp, alive, qCd, flashCd, ghostCd, ghostT, slowT, castT, actionT, facing, celebrate, mx, mz] = a;
  return {
    x, z, hp, alive: !!alive, qCd, flashCd, ghostCd, ghostT, slowT, castT, actionT, facing,
    celebrate: !!celebrate, moveTarget: mx == null ? null : { x: mx, z: mz },
  };
}

export const packCleaver = (p) => [p.id, p.team, r2(p.x), r2(p.z), r2(p.dx), r2(p.dz), r2(p.dist)];
export const unpackCleaver = ([id, team, x, z, dx, dz, dist]) => ({ id, team, x, z, dx, dz, dist });

// 상대 화면에 보일 외형(스킨·투척 무기). 모르는 값은 기본 문도·식칼로 되돌린다.
export const cleanLook = (look) => ({
  skin: look?.skin === 'ronaldo' || look?.skin === 'teemo' ? look.skin : 'classic',
  weapon: look?.weapon === 'soccer' ? 'soccer' : 'cleaver',
});
