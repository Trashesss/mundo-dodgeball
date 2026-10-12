# 문도 피구 (Dr. Mundo Dodgeball)

Phaser 3 기반 2.5D 문도 피구 봇전.

## 실행

```bash
npm install      # 최초 1회 (스프라이트 굽기용 의존성)
npm start        # http://localhost:5173
```

## 조작
우클릭(또는 좌클릭) 이동 · Q 식칼 투척 · D 점멸 · F 유체화 · S 정지 · 휠 줌 · M 음소거

## 구조
- `assets/mundo.glb` — 원본 모델
- `tools/bake.*` — headless Chrome + Three.js로 GLB를 8방향 스프라이트 아틀라스(`assets/sprites/`)와 아레나 배경(`assets/arena.png`)으로 굽는다
  - `npm run bake` 전체 재생성 / `node tools/bake.mjs arena` 배경만 / `node tools/bake.mjs preview out.png "Clip,Clip@0-1"` 확인용 시트
- `src/config.js` — 투영 각도·해상도·애니메이션 목록 (게임과 베이크가 공유)
- `src/rules.js` — 밸런스 수치
- `src/main.js` — Phaser 씬 (월드는 지면 좌표 x,z로 계산, 화면 y로 깊이 정렬)
- `src/bot.js` — 봇 AI (회피, 예측 사격, 점멸 회피)
- `src/hud.js` — 롤 스타일 DOM HUD
