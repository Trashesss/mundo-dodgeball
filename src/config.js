// 게임과 베이크(tools/bake.js)가 공유하는 2.5D 투영 상수.
// 월드 좌표: 지면 (x, z), 높이 y.  x+ = 화면 오른쪽, z+ = 화면 아래(카메라 쪽).
// 화면 좌표: sx = x * PPU,  sy = (z * sin(ELEV) - y * cos(ELEV)) * PPU
export const PROJ = {
  ELEV_DEG: 52,      // 카메라 내려다보는 각도 (롤은 대략 55도 근처)
  PPU: 40,           // 게임 화면에서 월드 1유닛당 픽셀
  BAKE_SCALE: 1.5,   // 스프라이트는 1.5배 해상도로 굽고 게임에서 축소
};
PROJ.SIN = Math.sin((PROJ.ELEV_DEG * Math.PI) / 180);
PROJ.COS = Math.cos((PROJ.ELEV_DEG * Math.PI) / 180);

export const ARENA = {
  R: 14,             // 플레이 가능한 반경
  ROCK_R: 15.2,      // 암벽 안쪽 경계
  EXTENT: 24,        // 배경 이미지가 덮는 범위
  MID_GAP: 0.35,     // 가운데 선 두께의 절반
};

// 굽는 애니메이션 목록 (GLB 클립 이름 → 게임 키)
export const SPRITE = {
  DIRS: 8,
  FRAME_W: 4.6,      // 프레임 한 칸이 덮는 화면 유닛 (가로)
  FRAME_H: 4.2,      // (세로)
  ANCHOR: 0.74,      // 발 위치(지면 원점)의 세로 비율
  ANIMS: [
    { key: 'idle',  clip: 'DrMundo_Idle01.anm', frames: 10, loop: true },
    { key: 'run',   clip: 'DrMundo_Run.anm',    frames: 12, loop: true },
    { key: 'throw', clip: 'Spell1',             frames: 8,  loop: false },
    { key: 'death', clip: 'Death',              frames: 14, loop: false },
    { key: 'dance', clip: 'Dance_Loop',         frames: 12, loop: true },
  ],
};
