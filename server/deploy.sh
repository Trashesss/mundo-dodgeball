#!/usr/bin/env bash
# 게임 서버 배포: 소스 복사 → 의존성 설치 → 서비스 재시작 → 상태 확인
# 사용: SSH_TARGET=ubuntu@3.37.101.179 SSH_KEY=~/.ssh/lightsail.pem server/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=${SSH_TARGET:?SSH_TARGET=user@host 를 지정하세요}
APP_DIR=${APP_DIR:-/opt/mundo-pigu}
SSH=(ssh -o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH+=(-i "$SSH_KEY")

"${SSH[@]}" "$TARGET" "sudo mkdir -p $APP_DIR && sudo chown \$(id -u):\$(id -g) $APP_DIR"
rsync -az --delete --exclude node_modules -e "${SSH[*]}" \
  package.json package-lock.json src server "$TARGET:$APP_DIR/"
"${SSH[@]}" "$TARGET" bash -s <<REMOTE
set -euo pipefail
cd $APP_DIR
npm ci --omit=dev --no-audit --no-fund
sudo cp server/mundo-pigu.service /etc/systemd/system/mundo-pigu.service
sudo systemctl daemon-reload
sudo systemctl enable --now mundo-pigu
sudo systemctl restart mundo-pigu
sleep 1
systemctl is-active mundo-pigu
curl -fsS http://127.0.0.1:3000/health && echo
REMOTE
