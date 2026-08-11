import { ref, get, set, runTransaction, onValue, off } from "firebase/database";
import { db } from "./firebase.js";

// ------------------------------------------------------------------
// Adapter layer that replaces the Claude-artifact-only `window.storage`
// API with Firebase Realtime Database, keyed the same way: room:<code>
// ------------------------------------------------------------------

// Realtime Database does not reliably preserve JS arrays: any array
// that becomes sparse (e.g. an item removed) or is stored fresh often
// round-trips back as a plain object with numeric string keys instead
// of a real Array. Every array field the game relies on (players,
// market, log, trueEvents, ...) then silently turns into a non-array,
// and the first .find()/.map()/.filter()/.push() call on it throws —
// which crashes the whole React tree with no error boundary (blank
// black screen). We normalize known array fields back into real
// arrays every time we read a room out of Firebase.
const ARRAY_FIELDS = [
  "players",
  "log",
  "trueEvents",
  "market",
  "fakeDeadIds",
  "frameLog",
  "verifyAttempts",
];

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    // Firebase gives back {0: ..., 1: ...} — rebuild in index order
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k]);
  }
  return [];
}

function normalizeRoom(data) {
  if (!data) return data;
  const out = { ...data };
  for (const field of ARRAY_FIELDS) {
    out[field] = toArray(out[field]);
  }
  // votes is a plain map (playerId -> targetId), not an array — but it
  // can come back as `undefined` if empty, which breaks `Object.keys`.
  out.votes = out.votes && typeof out.votes === "object" ? out.votes : {};
  return out;
}

function roomRef(code) {
  return ref(db, `rooms/${code}`);
}

export async function getRoom(code) {
  try {
    const snap = await get(roomRef(code));
    return snap.exists() ? normalizeRoom(snap.val()) : null;
  } catch (e) {
    console.error("getRoom failed", e);
    return null;
  }
}

export async function setRoom(code, data) {
  await set(roomRef(code), data);
}

// Atomic read-modify-write. Firebase's transaction retries automatically
// on concurrent writes, so this is what actually removes the race
// conditions the original polling+manual-retry version had to work
// around by hand (e.g. two people joining a room at once).
export async function updateRoom(code, mutateFn) {
  const result = await runTransaction(roomRef(code), (current) => {
    if (current === null) return current; // room doesn't exist, abort
    return mutateFn(normalizeRoom(current));
  });
  return result.committed ? normalizeRoom(result.snapshot.val()) : null;
}

// Realtime subscription — replaces the 2s polling loop from the
// original with push-based updates, which is both faster and cheaper
// on reads. Returns an unsubscribe function.
export function subscribeRoom(code, callback) {
  const r = roomRef(code);
  const listener = onValue(r, (snap) => {
    callback(snap.exists() ? normalizeRoom(snap.val()) : null);
  });
  return () => off(r, "value", listener);
}
