# 문도 피구 (Dr. Mundo Dodgeball)

Phaser 3 기반 2.5D 문도 피구. 브라우저 안에서 도는 봇전과, 초대 링크로 들어오는 친구와의 온라인 1대1을 지원한다.

## 실행

```bash
npm install      # 최초 1회 (스프라이트 굽기용 의존성 + 게임 서버의 ws)
npm start        # http://localhost:5173
npm run server   # 친구와 대결용 게임 서버 ws://localhost:3000/ws
```

localhost 에서 열면 게임은 `ws://localhost:3000/ws` 에 붙는다. 배포 페이지는 `wss://3.37.101.179/ws` 를 쓰며, `?server=ws://...` 쿼리로 다른 서버를 지정할 수 있다 (초대 링크에도 유지됨). 로컬에서 두 창을 띄워 직접 대결해 볼 수 있다.

## 조작
우클릭(또는 좌클릭) 이동 · Q 식칼 투척 · D 점멸 · F 유체화 · S 정지 · M 음소거

## 분석

선택을 저장하지 않은 첫 메인 화면에서는 동의 팝업을 자동으로 표시한다. 동의·거부를 선택하면 팝업이 닫히며 이후 방문에서는 다시 표시하지 않는다. Escape로 선택 없이 닫으면 해당 방문에서는 수집하지 않고, 다음 방문에 다시 안내한다. 메인 화면 우측 상단의 톱니바퀴 설정 버튼으로 팝업을 다시 열 수 있다.

메인 화면에서 선택적 개인정보 수집·이용에 동의한 경우에만 `src/analytics.js`에서 PostHog 미국 리전으로 사용 이벤트를 전송한다. 동의 전과 거부 상태에서는 SDK를 로드하지 않고 이벤트를 보관하거나 전송하지 않는다. 선택은 `mundo-analytics-consent-v1` 로컬 저장소 키에 저장하며, 메인 화면의 ‘동의 설정’에서 변경·철회할 수 있다. 철회하면 SDK 수집을 중단하고 분석용 저장 데이터를 지운다. 이미 전송된 데이터의 삭제는 별도 처리다. 저장소가 차단되어 있으면 현재 방문에서만 선택을 유지한다. 브라우저용 Project API key를 사용하며, 로그인 식별·자동 클릭 수집·세션 녹화는 사용하지 않는다. localhost, 루프백 주소, `/tools/`에서는 SDK 로드와 전송을 끈다.

- `$pageview`: 동의한 상태의 페이지 방문 (동의 전 방문은 기록하지 않음)
- `game_started`: 실제 게임 시작. `match_id`, `difficulty` (쌍둥이는 `twins`), `source` (`menu` 또는 `replay`)
- `game_finished`: 승패 확정. 같은 판 속성과 `result` (`win` 또는 `loss`), `duration_seconds` (실제 게임 진행 시간, 결과 대기 제외)
  - 플레이어의 `throws` (실제 발사된 식칼 수), `hits` (상대에게 명중한 식칼 수), `accuracy` (`hits / throws`, 0~1 비율)를 판 전체로 요약한다. 투척이 없으면 명중률은 0이다. 발사 전에 취소된 투척은 제외하며, 무승부 재경기는 합산하고 새 게임·재도전에서는 초기화한다.
  - 적도 같은 기준으로 `enemy_throws`, `enemy_hits`, `enemy_accuracy`를 기록한다. 쌍둥이 모드는 두 봇의 횟수를 합산하고, 명중률은 합산 명중 수 / 합산 투척 수로 계산한다.
- `replay_clicked`, `menu_returned`: 결과 화면에서 재도전 또는 난이도 선택. 직전 판 속성 포함
- 친구와 대결: `online_room_created`(`room`), `online_room_joined`(`room`, `slot`), `online_invite_shared`, `online_rematch_clicked`, `online_opponent_left`. 대인전의 `game_started` / `game_finished`는 `difficulty: online`, `mode: online`, `room`, `source` (`online` / `rematch` / `resume`)를 갖는다. 적 수치(`enemy_*`)는 상대 사람의 기록이다.

공유 성장 지표:

- 승리 결과에서는 `자랑하기`, 패배 결과에서는 `공유하기` 버튼을 표시한다. 공유 메시지에는 난이도와 결과를 표시하고, 승패 모두 `날아오는 식칼을 피하고, 상대 문도를 쓰러뜨리는 피구 게임` 설명을 사용한다.
- `share/`의 난이도·승패별 정적 페이지가 메신저용 OG/Twitter 문구와 이미지를 제공하고, 방문자는 추적 쿼리를 유지한 채 게임으로 이동한다. 문구 또는 디자인 수정 후 `node tools/render-share-preview.mjs`로 페이지와 이미지를 함께 다시 생성한다.

- 사용자 지정 게임에서 이긴 쪽에는 `굴욕 선사하기` 버튼을 표시한다(빠른 대전·패배·봇전에는 없음). 모달에서 상대 이름(최대 12자, 비워도 됨)을 넣으면 `{이름}? 발로 해도 이긴다 ㅋ`(비우면 `넌 발로 해도 이긴다 ㅋ`)와 `share/humiliate.html` 링크를 함께 복사한다. 링크 미리보기는 고정 짤(`assets/cartoon/share-preview-humiliate.png`)과 제목 `넌 발로해도 이긴다 ㅋ`이고, 이름은 복사 문구에만 들어간다.

- `share_clicked`: 공유 버튼 클릭마다 새 무작위 UUID `share_id` 생성. `match_id`, `difficulty`, `result` 포함
- `share_completed`: 네이티브 공유 API 성공 (`method: native`) 또는 클립보드 복사 성공 (`method: clipboard`). 실제 친구에게 전달·열람되었다는 뜻은 아니다.
- `share_cancelled`: 네이티브 공유창 취소
- `share_failed`: 자동 복사 실패. 복사 완료로 집계하지 않는다.
- `humiliate_clicked`: 굴욕 모달 열기 (`mode: online`, `room`). 복사 결과는 `share_completed` / `share_failed`에 `kind: humiliate`, `share_id`, `room`을 붙여 보내며, 입력한 이름은 보내지 않는다. 링크는 `utm_medium=humiliate`.
- 공유 URL에 `share_id`, `utm_source=friend`, `utm_medium=share`를 붙인다. 기존 쿼리·해시는 전달하지 않는다. 사용자 ID나 이메일을 링크에 넣지 않는다.
- `invite_opened`: 유효한 UUID v4 `share_id`가 있는 페이지 방문. 새로고침도 이벤트가 발생하므로 유입 성과는 고유 사용자로 집계한다. 자기 링크 방문이나 전달된 링크의 재공유도 포함될 수 있어 실제 친구 수와 같지는 않다.
- `game_started`, `game_finished`에는 `entry_source` (`share` / `direct`)를 추가하고 공유 유입이면 `referral_share_id`도 붙인다. 이 귀속은 현재 페이지와 그 안의 재도전 동안 유지되며, 추적 파라미터 없는 새 방문에는 이어지지 않는다. `source` (`menu` / `replay`)는 게임 시작 방식으로 별도 유지한다.

공유 의향은 게임 완료 고유 사용자 중 공유 클릭 고유 사용자 비율로 본다. 친구 쪽 퍼널은 `invite_opened` → `game_started` → `game_finished`로 구성하고, 유입의 `share_id`와 게임의 `referral_share_id`가 같도록 연결한다. 공유자는 다른 사용자이므로 `share_clicked`를 같은 사용자 퍼널의 첫 단계에 넣지 않는다. 공유별 유입 성과는 `share_id`로 별도 집계한다. 링크를 받은 전체 인원은 알 수 없으므로 완료율 분모는 공유 링크 방문 고유 사용자로 둔다.

배포 후 PostHog의 Activity에서 방문 → 시작 → 종료 → 재도전 이벤트를 확인한다. 방문 → `game_started` 퍼널, 난이도별 승률, 플레이 시간, 재도전율을 초기 지표로 사용한다. 페이지를 닫아 중단한 판에는 `game_finished`가 없으므로 종료율 해석 시 구분한다.

## 승부 규칙
상단 양쪽 초상화 옆에 현재 체력을 표시한다. 시간 제한 없이 상대를 쓰러뜨리면 승리하는 단판 승부다. 동시에 쓰러지면 재경기한다.
봇전에서는 라운드 시작 즉시 60초 동안 플레이어 쪽 왼쪽 반원의 반지름이 처음의 70%까지 서서히 줄어든다. 플레이어의 이동 범위만 함께 줄어들며, 경계에 닿으면 안쪽으로 밀려난다. 오른쪽 봇 진영은 경계선과 이동 범위 모두 처음 크기를 유지한다. 재경기와 메뉴 복귀 시 원 크기가 초기화된다.

## 친구와 대결 (온라인 1대1)
로그인 없이 초대 링크로 1대1을 한다. 메뉴의 **친구와 대결**을 누르면 방이 만들어지고, 대기실의 초대 링크(`?room=코드`)를 받은 친구는 메뉴를 거치지 않고 같은 방 대기실로 들어온다. 두 사람이 모두 **준비**를 누르면 3초 카운트다운 뒤 시작한다. 방장은 왼쪽, 친구는 오른쪽 진영에 서며 화면은 뒤집지 않는다. 내 문도만 초록 링·체력바로 표시하고, 식칼을 맞히면 양쪽 모두 따봉을 띄운다.

- **판정**: 서버가 `src/sim.js`로 60Hz 계산하고 이동·투척·점멸·유체화·체력·충돌·승패를 최종 판정한다. 30Hz 스냅샷과 즉시 이벤트(투척·적중·사망 등)를 보낸다.
- **지연 보정**: 내 문도는 클릭·스킬에 바로 반응(로컬 예측)하고, 스냅샷이 오면 서버 위치를 내 이동 목표 쪽으로 왕복 시간만큼 진행시켜 비교해 0.35유닛 이상 어긋날 때만 초당 최대 3유닛씩 맞춘다(1.5유닛 이상은 즉시). 체력·사망·적중은 서버 값을 따른다. 상대 문도는 스냅샷 도착 시각 기준 100ms 이전 시점을 보간해 그린다. 식칼은 서버 목록 기준으로 생성·제거하고 경과 시간만큼 앞으로 그린다.
- **대인전 규칙**: 경기장이 줄어들지 않고 양쪽 경계가 같다. 그 밖의 수치·단판 승부·동시 사망 재경기는 봇전과 같다.
- **연결 끊김**: 경기 중 한쪽이 끊기면 경기를 멈추고 남은 사람에게 15초 카운트를 보여준다. 끊긴 쪽이 새로고침하거나 자동 재연결(같은 탭의 `sessionStorage` 토큰)로 15초 안에 돌아오면 이어서 하고, 아니면 "상대가 나갔어요" 결과로 끝낸다. 결과 화면이나 대기실에서 나가도 상대에게 알린다.
- **재대결**: 결과 화면의 **재대결**을 한쪽이 누르면 상대에게 "친구가 재대결을 원해요"를 보여주고, 둘 다 누르면 같은 방에서 카운트다운부터 다시 시작한다.
- 방은 둘 다 나가거나 10분 동안 아무 메시지가 없으면 지운다. 방 코드는 헷갈리는 0/O, 1/I를 뺀 6자리다.

### 서버 배포 (Lightsail)
nginx가 `https://3.37.101.179/ws`를 `127.0.0.1:3000/ws`로 WebSocket 업그레이드해 넘기고, 게임 서버는 systemd(`server/mundo-pigu.service`, `DynamicUser`, 자동 재시작)로 실행한다. 3000번 포트는 외부에 열지 않는다. 배포는 다음 한 줄로 소스 복사 → `npm ci --omit=dev` → 서비스 재시작 → `/health` 확인까지 한다.

```bash
SSH_TARGET=ubuntu@3.37.101.179 SSH_KEY=~/.ssh/<lightsail-key>.pem server/deploy.sh
```

허용 Origin은 배포 서버(`NODE_ENV=production`)에서 `https://trashesss.github.io`뿐이고, localhost 페이지는 로컬에서 띄운 개발 서버(`npm run server`)에서만 허용한다. 다른 도메인은 `EXTRA_ORIGINS=https://a.example,https://b.example` 환경 변수로 추가한다.

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
- `src/sim.js` — 게임 계산 (이동 제한·투척·점멸·유체화·피격·사망·라운드 판정). Phaser·DOM 없이 브라우저 봇전과 서버가 함께 쓴다. 화면 효과는 `feed` 이벤트로만 알린다
- `src/main.js` — Phaser 씬. 씬이 sim 의 world 역할을 하며 이벤트를 받아 효과음·파티클을 그린다. 봇전은 로컬 계산, 대인전은 예측·보정·보간 (월드는 지면 좌표 x,z로 계산, 화면 y로 깊이 정렬)
- `src/online.js` — 게임 서버 연결·재접속·서버 시계 맞추기·대기실 화면
- `src/net-protocol.js` — 서버·브라우저 공용 상수와 스냅샷 압축 형식
- `server/index.mjs`, `server/room.mjs` — 1대1 게임 서버 (방, 준비, 카운트다운, 60Hz 판정, 재접속 대기, 재대결)
- `src/bot.js` — 봇 AI (회피, 예측 사격, 점멸 회피)
- `src/hud.js` — 롤 스타일 DOM HUD
- 검사: `npm run check:sim` (Node 단독 판정), `npm run check:online` (로컬 서버 + 브라우저 두 개로 방 링크·준비·이동 동기화·적중·따봉·KO·재대결·새로고침 재접속·상대 이탈 15초 안내), 그 밖의 `tools/check-*.mjs`는 봇전 회귀 검사
