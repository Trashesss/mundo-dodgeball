# 문도 피구 (Dr. Mundo Dodgeball)

Phaser 3 기반 2.5D 문도 피구 봇전.

## 실행

```bash
npm install      # 최초 1회 (스프라이트 굽기용 의존성)
npm start        # http://localhost:5173
```

## 조작
우클릭(또는 좌클릭) 이동 · Q 식칼 투척 · D 점멸 · F 유체화 · S 정지 · M 음소거

## 분석

`src/analytics.js`에서 PostHog 미국 리전으로 익명 사용 이벤트를 전송한다. 브라우저용 Project API key를 사용하며, 로그인 식별·자동 클릭 수집·세션 녹화는 사용하지 않는다. localhost, 루프백 주소, `/tools/`에서는 SDK 로드와 전송을 끈다.

- `$pageview`: 페이지 방문 (SDK 자동 수집)
- `game_started`: 실제 게임 시작. `match_id`, `difficulty` (쌍둥이는 `twins`), `source` (`menu` 또는 `replay`)
- `game_finished`: 승패 확정. 같은 판 속성과 `result` (`win` 또는 `loss`), `duration_seconds` (실제 게임 진행 시간, 결과 대기 제외)
  - 플레이어의 `throws` (실제 발사된 식칼 수), `hits` (상대에게 명중한 식칼 수), `accuracy` (`hits / throws`, 0~1 비율)를 판 전체로 요약한다. 투척이 없으면 명중률은 0이다. 발사 전에 취소된 투척은 제외하며, 무승부 재경기는 합산하고 새 게임·재도전에서는 초기화한다.
  - 적도 같은 기준으로 `enemy_throws`, `enemy_hits`, `enemy_accuracy`를 기록한다. 쌍둥이 모드는 두 봇의 횟수를 합산하고, 명중률은 합산 명중 수 / 합산 투척 수로 계산한다.
- `replay_clicked`, `menu_returned`: 결과 화면에서 재도전 또는 난이도 선택. 직전 판 속성 포함

공유 성장 지표:

- `share_clicked`: 공유 버튼 클릭마다 새 무작위 UUID `share_id` 생성. `match_id`, `difficulty`, `result` 포함
- `share_completed`: 네이티브 공유 API 성공 (`method: native`) 또는 클립보드 복사 성공 (`method: clipboard`). 실제 친구에게 전달·열람되었다는 뜻은 아니다.
- `share_cancelled`: 네이티브 공유창 취소
- `share_manual_copy_shown`: 자동 복사 실패로 수동 복사 영역 표시. 복사 완료로 집계하지 않는다.
- 공유 URL에 `share_id`, `utm_source=friend`, `utm_medium=share`를 붙인다. 기존 쿼리·해시는 전달하지 않는다. 사용자 ID나 이메일을 링크에 넣지 않는다.
- `invite_opened`: 유효한 UUID v4 `share_id`가 있는 페이지 방문. 새로고침도 이벤트가 발생하므로 유입 성과는 고유 사용자로 집계한다. 자기 링크 방문이나 전달된 링크의 재공유도 포함될 수 있어 실제 친구 수와 같지는 않다.
- `game_started`, `game_finished`에는 `entry_source` (`share` / `direct`)를 추가하고 공유 유입이면 `referral_share_id`도 붙인다. 이 귀속은 현재 페이지와 그 안의 재도전 동안 유지되며, 추적 파라미터 없는 새 방문에는 이어지지 않는다. `source` (`menu` / `replay`)는 게임 시작 방식으로 별도 유지한다.

공유 의향은 게임 완료 고유 사용자 중 공유 클릭 고유 사용자 비율로 본다. 친구 쪽 퍼널은 `invite_opened` → `game_started` → `game_finished`로 구성하고, 유입의 `share_id`와 게임의 `referral_share_id`가 같도록 연결한다. 공유자는 다른 사용자이므로 `share_clicked`를 같은 사용자 퍼널의 첫 단계에 넣지 않는다. 공유별 유입 성과는 `share_id`로 별도 집계한다. 링크를 받은 전체 인원은 알 수 없으므로 완료율 분모는 공유 링크 방문 고유 사용자로 둔다.

배포 후 PostHog의 Activity에서 방문 → 시작 → 종료 → 재도전 이벤트를 확인한다. 방문 → `game_started` 퍼널, 난이도별 승률, 플레이 시간, 재도전율을 초기 지표로 사용한다. 페이지를 닫아 중단한 판에는 `game_finished`가 없으므로 종료율 해석 시 구분한다.

## 승부 규칙
상단 양쪽 초상화 옆에 현재 체력을 표시한다. 시간 제한 없이 상대를 쓰러뜨리면 승리하는 단판 승부다. 동시에 쓰러지면 재경기한다.
라운드 시작 즉시 60초 동안 플레이어 쪽 왼쪽 반원의 반지름이 처음의 70%까지 서서히 줄어든다. 플레이어의 이동 범위만 함께 줄어들며, 경계에 닿으면 안쪽으로 밀려난다. 오른쪽 봇 진영은 경계선과 이동 범위 모두 처음 크기를 유지한다. 재경기와 메뉴 복귀 시 원 크기가 초기화된다.

## 구조
- Q 투척은 참고 영상처럼 식칼을 머리 위로 들어 올린 뒤 상체와 함께 앞으로 휘두르고, 발을 디딘 채 자세를 회복한다. 30프레임을 60fps로 재생하며 `src/throw-motion.js`에서 투척 자세와 발사 시점(0.14초), 회복 시간(0.5초)을 공유한다. 발사 뒤에는 빈손으로 회복하고 식칼이 다시 나타난다. 이동은 발사 직후 가능하며, 회복 중에는 투척 방향을 유지한다.
- 현재 게임은 `assets/cartoon/`의 카툰 캐릭터와 초상화를 사용한다. 모든 동작은 같은 `parts-source.png`의 몸·팔·다리 조각으로 만들어 동작 전환 시 그림체와 실루엣을 유지한다. 달리기는 30프레임을 60fps로 재생하며, 발의 이동과 들어 올리기를 1/4주기 어긋나게 해 번갈아 딛는다. 식칼을 든 팔은 빈손보다 작게 흔들고 투척 팔의 과도한 회전을 제한한다. 대기는 작은 호흡과 손 움직임을 2초 주기로 재생한다. 4개 방향을 반전·공유해 8방향에 대응하며, 방향 경계의 작은 흔들림을 억제하고 같은 동작에서 방향만 바뀌면 프레임과 경과 시간을 유지한다. 달리기 박자는 기본 이동 속도와 유체화·둔화 효과를 따르며, 충돌이나 목적지 직전의 짧은 이동 때문에 박자가 급변하지 않는다. 화면 갱신은 브라우저의 주기를 따른다. 이전 생성 달리기 스트립은 참고용으로 보존되어 있으며 현재 재생에는 사용하지 않는다.
- `npm run bake:cartoon`으로 아틀라스를 재생성하고, `npm run check:cartoon`으로 게임 실행·방향 전환·호흡·발 움직임·투척을 확인한다. `npm run preview:cartoon`은 **최종 아틀라스**에서 접촉 시트와 미리보기 프레임을 만든다. Pillow가 있는 Python으로 `tools/render-motion-gif.py`를 실행하면 `output/animation/`에 GIF를 저장한다. `http://localhost:5173/tools/animation-preview.html`에서 동작별 미리보기를 확인할 수 있다.
- 맵은 `assets/cartoon/arena.png`를 사용한다. 캐릭터와 같은 굵은 외곽선·단순한 명암의 둥근 바위, 보라색 수정, 잔잔한 카툰 물결로 구성한다. `npm run bake:arena`로 맵 이미지만 재생성한다.
- `assets/mundo.glb` — 원본 모델
- `tools/bake.*` — headless Chrome + Three.js로 GLB를 8방향 스프라이트 아틀라스(`assets/sprites/`)와 아레나 배경(`assets/arena.png`)으로 굽는다
  - `npm run bake` 전체 재생성 / `node tools/bake.mjs arena` 배경만 / `node tools/bake.mjs preview out.png "Clip,Clip@0-1"` 확인용 시트
- `src/config.js` — 투영 각도·해상도·애니메이션 목록 (게임과 베이크가 공유)
- `src/rules.js` — 밸런스 수치
- `src/main.js` — Phaser 씬 (월드는 지면 좌표 x,z로 계산, 화면 y로 깊이 정렬)
- `src/bot.js` — 봇 AI (회피, 예측 사격, 점멸 회피)
- `src/hud.js` — 롤 스타일 DOM HUD
