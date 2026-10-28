// 상점 공유 링크 기록: share_id 마다 링크를 연 방문자 ID를 모아 두고, 공유자가 아닌 사람이 연 링크를 알려준다.
// 무작위 UUID만 저장한다. 저장 위치는 ghosts.mjs 와 같다 (배포 서버는 systemd StateDirectory).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_SHARES = 20000;
const MAX_VISITORS = 10;
const SAVE_DELAY_MS = 2000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ReferralStore {
  constructor(dir = process.env.STATE_DIRECTORY || fileURLToPath(new URL('.data', import.meta.url))) {
    this.file = path.join(dir, 'referrals.json');
    this.map = new Map(); // 넣은 순서 = 오래된 순
    this.saveTimer = null;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data)) {
        for (const [id, visitors] of data.slice(-MAX_SHARES)) {
          if (UUID.test(id) && Array.isArray(visitors)) this.map.set(id, new Set(visitors.filter(v => UUID.test(v)).slice(0, MAX_VISITORS)));
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('referrals: 기록을 읽지 못해 비어 있는 채로 시작', error.message);
    }
  }

  get size() { return this.map.size; }

  open(shareId, visitor) {
    let visitors = this.map.get(shareId);
    if (!visitors) {
      visitors = new Set();
      this.map.set(shareId, visitors);
      if (this.map.size > MAX_SHARES) this.map.delete(this.map.keys().next().value);
    }
    if (visitors.has(visitor) || visitors.size >= MAX_VISITORS) return;
    visitors.add(visitor);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
  }

  // owner 말고 다른 방문자가 연 share_id 들
  opened(ids, owner) {
    return ids.filter(id => [...(this.map.get(id) ?? [])].some(v => v !== owner));
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this.map].map(([id, visitors]) => [id, [...visitors]])));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.warn('referrals: 저장 실패', error.message);
    }
  }
}
