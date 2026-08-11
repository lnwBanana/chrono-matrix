export const ROLE = {
  SABOTEUR: "SABOTEUR",
  OPERATOR: "OPERATOR",
};

export const PHASE = {
  LOBBY: "LOBBY",
  REVEAL: "REVEAL",
  LIVE: "LIVE",
  VOTE: "VOTE",
  RESULT: "RESULT",
  GAME_OVER: "GAME_OVER",
};

export const LIVE_PHASE_SECONDS = 240; // 4 min default live phase
export const VOTE_PHASE_SECONDS = 60;
export const EVENT_MIN_GAP = 30; // seconds
export const EVENT_MAX_GAP = 45;

export const NODES = ["Node A", "Node B", "Node C", "Node D", "Node E"];

export const EVENT_TEMPLATES = [
  (node) => `ไฟดับที่ ${node}`,
  (node) => `มีคนสแกนบัตรผ่าน ${node}`,
  (node) => `กล้องที่ ${node} จับความเคลื่อนไหวได้`,
  (node) => `ระบบล็อกที่ ${node} ถูกปลดล็อก`,
  (node) => `มีการโอนไฟล์ผ่าน ${node}`,
  (node) => `เสียงเตือนภัยดังที่ ${node}`,
];

export const BOT_NAMES = ["บอทเอ", "บอทบี", "บอทซี", "บอทดี", "บอทอี", "บอทเอฟ", "บอทจี", "บอทเอช", "บอทไอ"];

export const ITEM_CATALOG = {
  intercept: { name: "Proxy Redirect", cost: 25, desc: "สกัดแผนร้ายวินาทีสุดท้าย เด้งผลกลับไปหาคนร้าย" },
  fakeDead: { name: "Fake Dead Protocol", cost: 35, desc: "แกล้งตาย แอบดู Log ต่อได้ แล้วรีบูตกลับมาแฉได้ทีหลัง" },
  frame: { name: "Frame Setup", cost: 30, desc: "โอนความผิด/หลักฐานไปให้คนอื่น เสี่ยงเด้งกลับถ้าเป้าหมายมี Proxy Redirect" },
};

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function genVerifyCode() {
  const chars = "0123456789ABCDEF";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function genEvent(alivePlayers) {
  const node = NODES[Math.floor(Math.random() * NODES.length)];
  const template = EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];
  const text = template(node);
  const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
  const witnessCount = Math.random() < 0.5 ? 1 : 2;
  const witnesses = shuffled.slice(0, Math.min(witnessCount, shuffled.length)).map((p) => p.id);
  return {
    id: uid(),
    node,
    text,
    witnesses,
    time: Date.now(),
    verifyCode: genVerifyCode(),
  };
}

export function saboteurCount(n) {
  if (n <= 6) return 1;
  if (n <= 9) return 2;
  return 3;
}

export function isBot(player) {
  return player.id.startsWith("bot_");
}

export function initialRoomState(code, hostId, hostName) {
  return {
    code,
    hostId,
    phase: PHASE.LOBBY,
    players: [
      { id: hostId, name: hostName, alive: true, role: null, ap: 3, credits: 20, hasIntercept: false, hasFakeDead: false, faking: false, revived: false, lastSeen: Date.now() },
    ],
    saboteurTarget: null,
    saboteurOverride: null,
    round: 0,
    phaseEndsAt: null,
    votes: {},
    log: [],
    lastEliminated: null,
    winner: null,
    createdAt: Date.now(),
    trueEvents: [],
    nextEventAt: null,
    market: [],
    fakeDeadIds: [],
    frameLog: [],
    verifyAttempts: [],
    engineLockUntil: 0,
  };
}

export function addLog(room, text) {
  room.log = [...(room.log || []), { t: Date.now(), text }].slice(-50);
}
