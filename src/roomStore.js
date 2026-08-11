import { ref, get, set, runTransaction, onValue, off } from "firebase/database";
import { db } from "./firebase.js";

// ------------------------------------------------------------------
// Adapter layer that replaces the Claude-artifact-only `window.storage`
// API with Firebase Realtime Database, keyed the same way: room:<code>
// ------------------------------------------------------------------

// Realtime Database does not reliably preserve JS arrays: any array
// that becomes sparse (e.g. an item removed) or is stored fresh often
// round-trips back as a plain object with numeric string keys instead
// of a real Array — at ANY depth (top-level room fields, or arrays
// nested inside array items, like market[i].buyers). Any of these
// silently turning into a non-array means the first
// .find()/.map()/.includes()/.push()/.length call on it throws —
// which crashes the whole React tree (blank black screen) unless
// caught by an error boundary. Rather than hand-list every array
// field (easy to miss one, as happened before), we walk the entire
// object tree recursively and coerce anything that "looks like" a
// Firebase-mangled array (an object whose keys are exactly "0", "1",
// "2", ... in order) back into a real array.
function looksLikeMangledArray(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((k, i) => k === String(i));
}

function deepNormalize(value) {
  if (Array.isArray(value)) {
    return value.map(deepNormalize);
  }
  if (value && typeof value === "object") {
    if (looksLikeMangledArray(value)) {
      return Object.keys(value)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => deepNormalize(value[k]));
    }
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = deepNormalize(value[k]);
    }
    return out;
  }
  return value;
}

// Fields that must always be arrays even when empty/missing — Firebase
// omits empty arrays/objects entirely on write, so an empty market or
// an empty log comes back as `undefined`, not `[]`.
const REQUIRED_ARRAY_FIELDS = [
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
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => value[k]);
  }
  return [];
}

export function normalizeRoom(rawData) {
  if (!rawData) return rawData;
  const data = deepNormalize(rawData);
  const out = { ...data };
  for (const field of REQUIRED_ARRAY_FIELDS) {
    out[field] = toArray(out[field]);
  }
  // votes is a plain map (playerId -> targetId), not an array — but it
  // can come back as `undefined` if empty, which breaks `Object.keys`.
  out.votes = out.votes && typeof out.votes === "object" && !Array.isArray(out.votes) ? out.votes : {};
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
