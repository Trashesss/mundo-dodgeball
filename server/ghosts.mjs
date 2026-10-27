// 문도봇 고스트 저장소: 대인전에서 잰 성향을 파일 하나에 모아 두고, 빠른 대전 봇으로 하나씩 꺼낸다.
// 배포 서버는 systemd StateDirectory(/var/lib/mundo-pigu)에 쓴다. 앱 폴더는 배포 때 지워진다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEEDS, profileToDiff } from '../src/ghost.js';

const MAX = 300;
const REAL_SHARE = 0.7; // 실제 고스트가 있을 때 기본 성향 대신 고를 비율
const SAVE_DELAY_MS = 2000;

export class GhostStore {
  constructor(dir = process.env.STATE_DIRECTORY || fileURLToPath(new URL('.data', import.meta.url))) {
    this.file = path.join(dir, 'ghosts.json');
    this.list = [];
    this.saveTimer = null;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(data)) this.list = data.slice(-MAX);
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('ghosts: 기록을 읽지 못해 비어 있는 채로 시작', error.message);
    }
  }

  get size() { return this.list.length; }

  record(profile) {
    this.list.push(profile);
    if (this.list.length > MAX) this.list.splice(0, this.list.length - MAX);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), SAVE_DELAY_MS);
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.list));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.warn('ghosts: 저장 실패', error.message);
    }
  }

  // 봇 수치 하나 (src/bot.js initBot 에 그대로 넘긴다)
  pick() {
    const real = this.list.length && Math.random() < REAL_SHARE;
    const pool = real ? this.list : SEEDS;
    return profileToDiff(pool[Math.floor(Math.random() * pool.length)]);
  }
}
