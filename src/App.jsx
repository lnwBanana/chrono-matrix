import { useState, useEffect, useRef } from "react";
import { getRoom, setRoom, updateRoom, subscribeRoom } from "./roomStore.js";
import {
  ROLE,
  PHASE,
  LIVE_PHASE_SECONDS,
  VOTE_PHASE_SECONDS,
  EVENT_MIN_GAP,
  EVENT_MAX_GAP,
  NODES,
  BOT_NAMES,
  ITEM_CATALOG,
  uid,
  makeRoomCode,
  genEvent,
  saboteurCount,
  isBot,
  initialRoomState,
  addLog,
} from "./game/constants.js";
import { GlitchTitle, Panel, Btn, Countdown } from "./components/Atoms.jsx";
import { RevealScreen } from "./components/RevealScreen.jsx";
import { ItemsPanel } from "./components/ItemsPanel.jsx";
import { MarketPanel } from "./components/MarketPanel.jsx";

export default function ChronoMatrix() {
  const [screen, setScreen] = useState("home"); // home -> lobby -> game
  const [myId] = useState(() => uid());
  const [myName, setMyName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoomState] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isHost = room && room.hostId === myId;
  const me = room?.players?.find((p) => p.id === myId);

  function hostIsStale(freshRoom) {
    if (!freshRoom) return false;
    const hostPlayer = freshRoom.players.find((p) => p.id === freshRoom.hostId);
    if (!hostPlayer) return true;
    if (!hostPlayer.lastSeen) return false;
    return Date.now() - hostPlayer.lastSeen > 12000;
  }

  // realtime subscription — replaces the original's 2s poll loop with
  // push-based updates from Firebase Realtime Database
  useEffect(() => {
    if (!roomCode) return;
    const unsubscribe = subscribeRoom(roomCode, (r) => {
      if (r) setRoomState(r);
    });
    return unsubscribe;
  }, [roomCode]);

  // heartbeat: mark this client as "present" every few seconds
  useEffect(() => {
    if (!roomCode || !me) return;
    const beat = setInterval(async () => {
      await updateRoom(roomCode, (fresh) => {
        const p = fresh.players.find((pp) => pp.id === myId);
        if (p) p.lastSeen = Date.now();
        return fresh;
      });
    }, 5000);
    return () => clearInterval(beat);
  }, [roomCode, myId, !!me]);

  const PRESENCE_WINDOW_MS = 8000;
  function computeIsDriver(freshRoom) {
    if (!freshRoom) return false;
    const now = Date.now();
    const present = freshRoom.players.filter(
      (p) => !isBot(p) && p.lastSeen && now - p.lastSeen < PRESENCE_WINDOW_MS
    );
    const candidates = present.length > 0 ? present : freshRoom.players.filter((p) => !isBot(p));
    if (candidates.length === 0) return false;
    const driverId = candidates.map((p) => p.id).sort()[0];
    return driverId === myId;
  }
  const isDriver = computeIsDriver(room);
  const canActAsHost = isHost || (isDriver && hostIsStale(room));

  // engine: auto-advance phases when timer expires
  useEffect(() => {
    if (!isDriver || !room) return;
    if (!room.phaseEndsAt) return;
    const check = setInterval(async () => {
      if (Date.now() >= room.phaseEndsAt) {
        const fresh = await getRoom(roomCode);
        if (!fresh) return;
        if (fresh.phase === PHASE.LIVE) {
          await beginVote(fresh);
        } else if (fresh.phase === PHASE.VOTE) {
          await resolveVote(fresh);
        }
      }
    }, 1000);
    return () => clearInterval(check);
  }, [isDriver, room, roomCode]);

  // engine: tick random true-events into existence during LIVE phase
  useEffect(() => {
    if (!isDriver || !room) return;
    if (room.phase !== PHASE.LIVE) return;
    const tick = setInterval(async () => {
      await updateRoom(roomCode, (fresh) => {
        if (fresh.phase !== PHASE.LIVE) return fresh;
        if (fresh.nextEventAt && Date.now() < fresh.nextEventAt) return fresh;
        const alive = fresh.players.filter((p) => p.alive);
        if (alive.length === 0) return fresh;
        const ev = genEvent(alive);
        fresh.trueEvents = [...(fresh.trueEvents || []), ev];
        fresh.nextEventAt = Date.now() + (EVENT_MIN_GAP + Math.random() * (EVENT_MAX_GAP - EVENT_MIN_GAP)) * 1000;
        return fresh;
      });
    }, 3000);
    return () => clearInterval(tick);
  }, [isDriver, room?.phase, roomCode]);

  // engine: drive bot behavior (solo test mode)
  useEffect(() => {
    if (!isDriver || !room) return;
    const hasBots = room.players.some((p) => isBot(p));
    if (!hasBots) return;

    const act = setInterval(async () => {
      await updateRoom(roomCode, (fresh) => {
        let changed = false;
        const bots = fresh.players.filter((p) => isBot(p) && p.alive);

        if (fresh.phase === PHASE.LIVE) {
          for (const bot of bots) {
            const roll = Math.random();
            const witnessed = fresh.trueEvents.filter(
              (e) => e.witnesses.includes(bot.id) && !fresh.market.some((l) => l.linkedEventId === e.id)
            );
            if (witnessed.length > 0 && roll < 0.25) {
              const ev = witnessed[0];
              const sellFree = Math.random() < 0.4;
              if (sellFree) {
                addLog(fresh, `${bot.name}: แฉความจริง — "${ev.text}"`);
              } else {
                fresh.market.push({
                  id: uid(),
                  sellerId: bot.id,
                  kind: "true",
                  node: ev.node,
                  text: ev.text,
                  price: 25 + Math.floor(Math.random() * 30),
                  buyers: [],
                  linkedEventId: ev.id,
                  time: Date.now(),
                });
                addLog(fresh, `${bot.name} วางขายข้อมูลในตลาด`);
              }
              changed = true;
            } else if (roll < 0.1) {
              const node = NODES[Math.floor(Math.random() * NODES.length)];
              fresh.market.push({
                id: uid(),
                sellerId: bot.id,
                kind: "forged",
                node,
                text: `เห็นบางอย่างน่าสงสัยที่ ${node}`,
                price: 15 + Math.floor(Math.random() * 40),
                buyers: [],
                linkedEventId: null,
                time: Date.now(),
              });
              addLog(fresh, `${bot.name} วางขายข้อมูลในตลาด`);
              changed = true;
            } else if (roll < 0.16 && bot.credits >= 25) {
              const unread = fresh.market.filter(
                (l) => l.sellerId !== bot.id && !l.buyers.includes(bot.id) && l.price <= bot.credits
              );
              if (unread.length > 0) {
                const pick = unread[Math.floor(Math.random() * unread.length)];
                bot.credits -= pick.price;
                const seller = fresh.players.find((p) => p.id === pick.sellerId);
                if (seller) seller.credits += pick.price;
                pick.buyers.push(bot.id);
                changed = true;
              }
            }
          }
        } else if (fresh.phase === PHASE.VOTE) {
          for (const bot of bots) {
            if (fresh.votes[bot.id]) continue;
            const others = fresh.players.filter((p) => p.alive && p.id !== bot.id);
            if (others.length === 0) continue;
            const skip = Math.random() < 0.2;
            fresh.votes[bot.id] = skip ? "skip" : others[Math.floor(Math.random() * others.length)].id;
            changed = true;
          }
        }

        return changed ? fresh : fresh;
      });
    }, 4000);
    return () => clearInterval(act);
  }, [isDriver, room?.phase, roomCode]);

  async function createRoom() {
    if (!myName.trim()) return setError("ใส่ชื่อก่อนครับ");
    setBusy(true);
    const code = makeRoomCode();
    const r = initialRoomState(code, myId, myName.trim());
    await setRoom(code, r);
    setRoomCode(code);
    setRoomState(r);
    setScreen("lobby");
    setBusy(false);
  }

  async function joinRoom() {
    if (!myName.trim()) return setError("ใส่ชื่อก่อนครับ");
    const code = joinCode.trim().toUpperCase();
    if (!code) return setError("ใส่รหัสห้องด้วยครับ");
    setBusy(true);

    const existing = await getRoom(code);
    if (!existing) {
      setError("ไม่เจอห้องนี้ เช็กรหัสอีกทีนะ");
      setBusy(false);
      return;
    }

    // Firebase transactions handle the concurrent-join race atomically,
    // so unlike the original's manual retry loop we just need one
    // transaction that validates + writes inside the same atomic step.
    let joinError = null;
    const result = await updateRoom(code, (fresh) => {
      if (fresh.phase !== PHASE.LOBBY) {
        joinError = "ห้องนี้เริ่มเกมไปแล้ว";
        return fresh;
      }
      if (fresh.players.some((p) => p.id !== myId && p.name.toLowerCase() === myName.trim().toLowerCase())) {
        joinError = "ชื่อนี้มีคนใช้แล้วในห้อง ลองชื่ออื่น";
        return fresh;
      }
      if (fresh.players.length >= 10 && !fresh.players.some((p) => p.id === myId)) {
        joinError = "ห้องเต็มแล้ว (10 คน)";
        return fresh;
      }
      if (!fresh.players.some((p) => p.id === myId)) {
        fresh.players.push({ id: myId, name: myName.trim(), alive: true, role: null, ap: 3, credits: 20, hasIntercept: false, hasFakeDead: false, faking: false, revived: false, lastSeen: Date.now() });
        addLog(fresh, `${myName.trim()} เข้าห้อง`);
      }
      return fresh;
    });

    if (joinError) {
      setError(joinError);
      setBusy(false);
      return;
    }
    if (result && result.players.some((p) => p.id === myId)) {
      setRoomCode(code);
      setRoomState(result);
      setScreen("lobby");
      setBusy(false);
      return;
    }
    setError("เข้าห้องไม่สำเร็จ ลองอีกครั้งนะ");
    setBusy(false);
  }

  async function addBot() {
    await updateRoom(roomCode, (fresh) => {
      if (fresh.phase !== PHASE.LOBBY) return fresh;
      if (fresh.players.length >= 10) return fresh;
      const usedNames = new Set(fresh.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !usedNames.has(n)) || `บอท${fresh.players.length}`;
      fresh.players.push({
        id: `bot_${uid()}`,
        name,
        alive: true,
        role: null,
        ap: 3,
        credits: 20,
        hasIntercept: false,
        hasFakeDead: false,
        faking: false,
        revived: false,
      });
      addLog(fresh, `${name} (บอททดสอบ) เข้าห้อง`);
      return fresh;
    });
  }

  async function removeBot(botId) {
    await updateRoom(roomCode, (fresh) => {
      if (fresh.phase !== PHASE.LOBBY) return fresh;
      fresh.players = fresh.players.filter((p) => p.id !== botId);
      return fresh;
    });
  }

  async function startGame() {
    if (!room) return;
    const n = room.players.length;
    if (n < 4) return setError("ต้องมีอย่างน้อย 4 คนถึงจะเริ่มได้");
    setBusy(true);
    await updateRoom(roomCode, (fresh) => {
      const nn = fresh.players.length;
      const nSab = fresh.saboteurOverride || saboteurCount(nn);
      const shuffled = [...fresh.players].sort(() => Math.random() - 0.5);
      shuffled.forEach((p, i) => {
        p.role = i < nSab ? ROLE.SABOTEUR : ROLE.OPERATOR;
      });
      const roleMap = Object.fromEntries(shuffled.map((p) => [p.id, p.role]));
      fresh.players = fresh.players.map((p) => ({ ...p, role: roleMap[p.id], alive: true }));
      fresh.phase = PHASE.REVEAL;
      fresh.round = 1;
      addLog(fresh, `เกมเริ่ม! ผู้เล่น ${nn} คน, ผู้ร้าย ${nSab} คน`);
      return fresh;
    });
    setBusy(false);
  }

  async function hostBeginLive() {
    await updateRoom(roomCode, (fresh) => {
      fresh.phase = PHASE.LIVE;
      fresh.phaseEndsAt = Date.now() + LIVE_PHASE_SECONDS * 1000;
      fresh.nextEventAt = Date.now() + (EVENT_MIN_GAP + Math.random() * (EVENT_MAX_GAP - EVENT_MIN_GAP)) * 1000;
      addLog(fresh, `รอบที่ ${fresh.round}: เริ่ม Live Phase — คุยกันได้เลย!`);
      return fresh;
    });
  }

  async function postToMarket({ kind, node, text, price, linkedEventId, fakeCode }) {
    await updateRoom(roomCode, (fresh) => {
      if (fresh.phase !== PHASE.LIVE) return fresh;
      let verifyCode = null;
      if (kind === "true" && linkedEventId) {
        const ev = fresh.trueEvents.find((e) => e.id === linkedEventId);
        verifyCode = ev?.verifyCode || null;
      } else if (kind === "forged") {
        verifyCode = fakeCode || null;
      }
      const listing = {
        id: uid(),
        sellerId: myId,
        kind,
        node,
        text,
        price: Math.max(0, Math.min(999, Math.floor(price) || 0)),
        buyers: [],
        linkedEventId: linkedEventId || null,
        verifyCode,
        time: Date.now(),
      };
      fresh.market = [...fresh.market, listing];
      addLog(fresh, `มีข้อมูลใหม่วางขายในตลาด (${listing.price} Credits)`);
      return fresh;
    });
  }

  async function revealTruthPublicly(eventId) {
    await updateRoom(roomCode, (fresh) => {
      const ev = fresh.trueEvents.find((e) => e.id === eventId);
      if (!ev) return fresh;
      addLog(fresh, `${myName || me?.name}: แฉความจริง — "${ev.text}"`);
      return fresh;
    });
  }

  async function checkVerifyCode(code) {
    const clean = (code || "").trim().toUpperCase();
    if (!clean) return;
    await updateRoom(roomCode, (fresh) => {
      const matches = fresh.trueEvents.some((e) => e.verifyCode === clean);
      fresh.verifyAttempts = [
        ...(fresh.verifyAttempts || []),
        { t: Date.now(), playerId: myId, playerName: me?.name || "?", code: clean, result: matches ? "valid" : "invalid" },
      ].slice(-20);
      addLog(fresh, `${me?.name || "?"} ตรวจรหัส ${clean} → ${matches ? "✅ ยืนยันจริง" : "❌ ไม่พบในระบบ"}`);
      return fresh;
    });
  }

  async function buyListing(listingId) {
    await updateRoom(roomCode, (fresh) => {
      const listing = fresh.market.find((l) => l.id === listingId);
      if (!listing) return fresh;
      if (listing.buyers.includes(myId) || listing.sellerId === myId) return fresh;
      const buyer = fresh.players.find((p) => p.id === myId);
      if (!buyer || buyer.credits < listing.price) return fresh;
      buyer.credits -= listing.price;
      const seller = fresh.players.find((p) => p.id === listing.sellerId);
      if (seller) seller.credits += listing.price;
      listing.buyers.push(myId);
      return fresh;
    });
  }

  async function buyItem(itemKey) {
    await updateRoom(roomCode, (fresh) => {
      const p = fresh.players.find((pp) => pp.id === myId);
      if (!p || !p.alive) return fresh;
      const item = ITEM_CATALOG[itemKey];
      if (p.credits < item.cost) return fresh;
      if (itemKey === "intercept" && p.hasIntercept) return fresh;
      if (itemKey === "fakeDead" && p.hasFakeDead) return fresh;
      p.credits -= item.cost;
      if (itemKey === "intercept") p.hasIntercept = true;
      if (itemKey === "fakeDead") p.hasFakeDead = true;
      addLog(fresh, `${p.name} ซื้อไอเทมลับบางอย่างจากตลาดมืด`);
      return fresh;
    });
  }

  async function activateFakeDead() {
    await updateRoom(roomCode, (fresh) => {
      const p = fresh.players.find((pp) => pp.id === myId);
      if (!p || !p.hasFakeDead || p.faking || !p.alive) return fresh;
      p.hasFakeDead = false;
      p.faking = true;
      p.alive = false;
      fresh.fakeDeadIds = [...(fresh.fakeDeadIds || []), myId];
      addLog(fresh, `${p.name} หายไปจากระบบ... (สงสัยว่าตายแล้ว)`);
      return fresh;
    });
  }

  async function rebootFromFakeDead() {
    await updateRoom(roomCode, (fresh) => {
      const p = fresh.players.find((pp) => pp.id === myId);
      if (!p || !p.faking) return fresh;
      p.faking = false;
      p.alive = true;
      p.revived = true;
      fresh.fakeDeadIds = (fresh.fakeDeadIds || []).filter((id) => id !== myId);
      addLog(fresh, `⚡ ${p.name} รีบูตกลับมาแล้ว! ไม่ได้ตายจริง!`);
      return fresh;
    });
  }

  async function callEmergencyMeeting() {
    const fresh = await getRoom(roomCode);
    if (!fresh || fresh.phase !== PHASE.LIVE) return;
    await beginVote(fresh);
  }

  async function beginVote() {
    await updateRoom(roomCode, (fresh) => {
      fresh.phase = PHASE.VOTE;
      fresh.phaseEndsAt = Date.now() + VOTE_PHASE_SECONDS * 1000;
      fresh.votes = {};
      addLog(fresh, "เรียกประชุมฉุกเฉิน! ทุกคนโหวตได้เลย");
      return fresh;
    });
  }

  async function castVote(targetId) {
    await updateRoom(roomCode, (fresh) => {
      if (fresh.phase !== PHASE.VOTE) return fresh;
      if (!fresh.players.find((p) => p.id === myId)?.alive) return fresh;
      fresh.votes[myId] = targetId;
      return fresh;
    });
  }

  async function useFrameSetup(targetId) {
    await updateRoom(roomCode, (fresh) => {
      const p = fresh.players.find((pp) => pp.id === myId);
      const target = fresh.players.find((pp) => pp.id === targetId);
      if (!p || !target || !p.alive || p.credits < ITEM_CATALOG.frame.cost) return fresh;
      p.credits -= ITEM_CATALOG.frame.cost;
      if (target.hasIntercept) {
        target.hasIntercept = false;
        fresh.frameLog = [...(fresh.frameLog || []), { from: myId, to: targetId, reflected: true }];
        addLog(fresh, `🔁 ความพยายามใส่ร้ายถูกสะท้อนกลับ! (Proxy Redirect ทำงาน)`);
        p.framedBy = "self";
      } else {
        fresh.frameLog = [...(fresh.frameLog || []), { from: myId, to: targetId, reflected: false }];
        addLog(fresh, `⚠️ มีหลักฐานปลอมปรากฏขึ้น ชี้ไปทางบางคนในห้อง...`);
        target.framed = true;
      }
      return fresh;
    });
  }

  async function resolveVote() {
    await updateRoom(roomCode, (fresh) => {
      const tally = {};
      Object.values(fresh.votes).forEach((t) => {
        if (t === "skip") return;
        tally[t] = (tally[t] || 0) + 1;
      });
      let maxVotes = 0;
      let leaders = [];
      Object.entries(tally).forEach(([id, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          leaders = [id];
        } else if (count === maxVotes) {
          leaders.push(id);
        }
      });
      let eliminated = null;
      if (maxVotes > 0 && leaders.length === 1) {
        eliminated = leaders[0];
        const target = fresh.players.find((pp) => pp.id === eliminated);
        if (target?.hasIntercept) {
          target.hasIntercept = false;
          addLog(fresh, `🛡️ ${target.name} ใช้ Proxy Redirect สกัดไว้ทัน! รอดจากการโหวตออก!`);
          eliminated = null;
        } else {
          fresh.players = fresh.players.map((p) =>
            p.id === eliminated ? { ...p, alive: false } : p
          );
          addLog(fresh, `${target.name} ถูกโหวตออก — เป็น ${target.role === ROLE.SABOTEUR ? "ผู้ร้าย 🔴" : "ผู้บริสุทธิ์ 🟢"}`);
        }
      } else {
        addLog(fresh, "โหวตเสมอกัน — ไม่มีใครถูกคัดออกรอบนี้");
      }
      fresh.lastEliminated = eliminated;
      fresh.phase = PHASE.RESULT;
      fresh.phaseEndsAt = null;

      const alive = fresh.players.filter((p) => p.alive);
      const aliveSab = alive.filter((p) => p.role === ROLE.SABOTEUR).length;
      const aliveOp = alive.filter((p) => p.role === ROLE.OPERATOR).length;
      if (aliveSab === 0) {
        fresh.winner = "OPERATORS";
        fresh.phase = PHASE.GAME_OVER;
        addLog(fresh, "🟢 ฝ่ายผู้บริสุทธิ์ชนะ! กำจัดผู้ร้ายหมดแล้ว");
      } else if (aliveSab >= aliveOp) {
        fresh.winner = "SABOTEURS";
        fresh.phase = PHASE.GAME_OVER;
        addLog(fresh, "🔴 ฝ่ายผู้ร้ายชนะ! คุมเกมได้แล้ว");
      }
      return fresh;
    });
  }

  async function hostNextRound() {
    await updateRoom(roomCode, (fresh) => {
      fresh.round += 1;
      fresh.lastEliminated = null;
      fresh.phase = PHASE.LIVE;
      fresh.phaseEndsAt = Date.now() + LIVE_PHASE_SECONDS * 1000;
      fresh.nextEventAt = Date.now() + (EVENT_MIN_GAP + Math.random() * (EVENT_MAX_GAP - EVENT_MIN_GAP)) * 1000;
      fresh.votes = {};
      fresh.players = fresh.players.map((p) => ({ ...p, ap: Math.min(6, p.ap + 2) }));
      addLog(fresh, `รอบที่ ${fresh.round}: เริ่ม Live Phase`);
      return fresh;
    });
  }

  async function resetToLobby() {
    await updateRoom(roomCode, (fresh) => {
      fresh.phase = PHASE.LOBBY;
      fresh.players = fresh.players.map((p) => ({ ...p, role: null, alive: true, ap: 3, credits: 20, hasIntercept: false, hasFakeDead: false, faking: false, revived: false }));
      fresh.round = 0;
      fresh.votes = {};
      fresh.lastEliminated = null;
      fresh.winner = null;
      fresh.phaseEndsAt = null;
      addLog(fresh, "กลับสู่ Lobby — พร้อมเล่นรอบใหม่");
      return fresh;
    });
  }

  // ---------------- RENDER ----------------

  if (screen === "home") {
    return (
      <div className="min-h-screen bg-black text-zinc-200 flex flex-col items-center justify-center p-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-emerald-500 text-xs tracking-[0.3em] mb-2">SYSTEM ACCESS</div>
            <GlitchTitle size="text-3xl">CHRONO-MATRIX</GlitchTitle>
            <div className="text-zinc-500 text-xs mt-2">social deduction // network breach</div>
          </div>

          <Panel className="mb-4">
            <label className="text-xs text-emerald-500 block mb-1">ชื่อผู้เล่น</label>
            <input
              className="w-full bg-black border border-emerald-900 rounded px-3 py-2 text-emerald-100 mb-4 focus:outline-none focus:border-emerald-500"
              placeholder="เช่น เจได"
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              maxLength={16}
            />
            <Btn onClick={createRoom} disabled={busy} className="w-full mb-3">
              + สร้างห้องใหม่
            </Btn>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-black border border-emerald-900 rounded px-3 py-2 text-emerald-100 uppercase focus:outline-none focus:border-emerald-500"
                placeholder="รหัสห้อง"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                maxLength={5}
              />
              <Btn onClick={joinRoom} disabled={busy} variant="ghost">
                เข้าห้อง
              </Btn>
            </div>
          </Panel>
          {error && <div className="text-rose-400 text-sm text-center">{error}</div>}
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-black text-emerald-300 flex items-center justify-center font-mono">
        connecting...
      </div>
    );
  }

  // LOBBY
  if (room.phase === PHASE.LOBBY) {
    const n = room.players.length;
    const nSab = room.saboteurOverride || saboteurCount(n);
    return (
      <div className="min-h-screen bg-black text-zinc-200 p-5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="text-zinc-500 text-xs">ROOM CODE</div>
            <div className="text-4xl font-bold text-emerald-300 tracking-widest">{roomCode}</div>
          </div>

          <Panel className="mb-4">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-emerald-500">ผู้เล่น ({n})</span>
              <span className="text-xs text-zinc-500">ผู้ร้าย: {nSab}</span>
            </div>
            <div className="space-y-2">
              {room.players.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-black/40 rounded px-3 py-2">
                  <span className={p.id === myId ? "text-emerald-300 font-semibold" : "text-zinc-300"}>
                    {p.name} {p.id === room.hostId && <span className="text-amber-500 text-xs">HOST</span>}
                    {isBot(p) && <span className="text-purple-400 text-xs ml-1">🤖 BOT</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    {p.id === myId && <span className="text-xs text-zinc-600">คุณ</span>}
                    {isHost && isBot(p) && (
                      <button
                        onClick={() => removeBot(p.id)}
                        className="text-xs text-zinc-600 hover:text-rose-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {canActAsHost && (
            <Panel className="mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-purple-300">🤖 โหมดทดสอบคนเดียว</div>
                  <div className="text-xs text-zinc-500">เพิ่มบอทมาเล่นแทนเพื่อน (บอทจะขาย/ซื้อ/โหวตเอง)</div>
                </div>
                <Btn variant="ghost" onClick={addBot} disabled={n >= 10} className="text-xs px-3 py-1.5 whitespace-nowrap">
                  + เพิ่มบอท
                </Btn>
              </div>
            </Panel>
          )}

          {canActAsHost && (
            <>
              <Panel className="mb-4">
                <div className="text-xs text-zinc-500 mb-2">ปรับจำนวนผู้ร้าย (ไม่บังคับ)</div>
                <div className="flex gap-2">
                  {[1, 2, 3].map((k) => (
                    <button
                      key={k}
                      className={`flex-1 py-2 rounded text-sm ${nSab === k ? "bg-rose-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
                      onClick={async () => {
                        await updateRoom(roomCode, (fresh) => {
                          fresh.saboteurOverride = k;
                          return fresh;
                        });
                      }}
                    >
                      {k} คน
                    </button>
                  ))}
                </div>
              </Panel>
              <Btn onClick={startGame} disabled={n < 4 || busy} className="w-full">
                {n < 4 ? `ต้องมีอย่างน้อย 4 คน (${n}/4)` : "เริ่มเกม"}
              </Btn>
            </>
          )}
          {!canActAsHost && (
            <div className="text-center text-zinc-500 text-sm">รอโฮสต์กดเริ่มเกม...</div>
          )}
          {error && <div className="text-rose-400 text-sm text-center mt-3">{error}</div>}
        </div>
      </div>
    );
  }

  // REVEAL
  if (room.phase === PHASE.REVEAL) {
    return <RevealScreen me={me} room={room} isHost={canActAsHost} onContinue={hostBeginLive} />;
  }

  // LIVE
  if (room.phase === PHASE.LIVE) {
    const iAmFaking = me?.faking;
    const iAmDead = me && !me.alive && !iAmFaking;

    if (iAmDead) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-500 flex flex-col items-center justify-center p-6 text-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="text-5xl mb-4 opacity-60">👻</div>
          <div className="text-lg text-zinc-400 font-semibold mb-2">คุณถูกคัดออกแล้ว</div>
          <p className="text-xs text-zinc-600 max-w-xs mb-6">
            คว่ำมือถือหรือวางลงเลย — ห้ามพูด ห้ามให้คำใบ้ ห้ามส่งสัญญาณตามาให้ใครดู
            รอจนกว่าเกมจะจบแล้วค่อยดูผลได้
          </p>
          <div className="text-xs text-zinc-700 border border-zinc-800 rounded-full px-4 py-1">
            รอบที่ {room.round} · เกมกำลังดำเนินอยู่
          </div>
        </div>
      );
    }

    const canSeeFull = me?.alive || iAmFaking;
    return (
      <div className={`min-h-screen text-zinc-200 p-5 pb-10 ${iAmFaking ? "bg-zinc-950" : "bg-black"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div className="text-xs text-zinc-500">รอบที่ {room.round} · LIVE PHASE</div>
            <div className={`text-xs px-2 py-1 rounded ${
              iAmFaking ? "bg-purple-900 text-purple-300" : "bg-emerald-900 text-emerald-300"
            }`}>
              {iAmFaking ? "🎭 แกล้งตายอยู่ (แอบดูได้)" : "รอด"}
            </div>
          </div>

          {iAmFaking && (
            <Panel className="mb-4 border-purple-800 bg-purple-950/30">
              <div className="text-sm text-purple-200 mb-1">
                คุณแกล้งตายอยู่ — คนอื่นเห็นว่าคุณตายแล้ว
              </div>
              <div className="text-xs text-purple-400 mb-2">
                ⚠️ ต้องทำตัวเหมือนคนตายจริงต่อหน้าเพื่อน (นั่งเงียบ วางมือถือคว่ำ) แต่แอบเช็คจอได้เป็นระยะ ยังดู Log/ตลาดได้ปกติ
              </div>
              <Btn onClick={rebootFromFakeDead} className="w-full text-sm">
                ⚡ Reboot กลับมาแฉตอนนี้
              </Btn>
            </Panel>
          )}

          <div className="flex justify-between items-center mb-4">
            <Countdown endsAt={room.phaseEndsAt} />
            <div className="text-right text-xs">
              <div className="text-amber-400 font-semibold">{me?.credits ?? 0} Credits</div>
              <div className="text-zinc-500">{me?.ap ?? 0} AP</div>
            </div>
          </div>

          <Panel className="mb-4">
            <div className="text-xs text-emerald-500 mb-2">สถานะผู้เล่น</div>
            <div className="grid grid-cols-2 gap-2">
              {room.players.map((p) => (
                <div key={p.id} className={`rounded px-2 py-1.5 text-sm ${p.alive ? "bg-black/40 text-zinc-300" : "bg-black/20 text-zinc-600 line-through"}`}>
                  {p.name}
                </div>
              ))}
            </div>
          </Panel>

          {canSeeFull && (
            <>
              <MarketPanel
                room={room}
                myId={myId}
                me={me}
                onPost={postToMarket}
                onBuy={buyListing}
                onRevealFree={revealTruthPublicly}
                onVerify={checkVerifyCode}
              />

              <ItemsPanel
                me={me}
                room={room}
                onBuyItem={buyItem}
                onActivateFakeDead={activateFakeDead}
                onFrameSetup={useFrameSetup}
              />
            </>
          )}

          <Panel className="mb-4">
            <div className="text-xs text-emerald-500 mb-2">Log สาธารณะ</div>
            <div className="space-y-1 max-h-32 overflow-y-auto text-xs text-zinc-400">
              {room.log.slice().reverse().slice(0, 8).map((l, i) => (
                <div key={i}>▸ {l.text}</div>
              ))}
            </div>
          </Panel>

          {!iAmFaking && (
            <Btn variant="danger" onClick={callEmergencyMeeting} className="w-full">
              🚨 เรียกประชุมฉุกเฉิน
            </Btn>
          )}
        </div>
      </div>
    );
  }

  // VOTE
  if (room.phase === PHASE.VOTE) {
    const myVote = room.votes[myId];
    const votedCount = Object.keys(room.votes).length;
    const aliveCount = room.players.filter((p) => p.alive).length;
    const iAmDead = me && !me.alive && !me.faking;

    if (iAmDead) {
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-500 flex flex-col items-center justify-center p-6 text-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <div className="text-5xl mb-4 opacity-60">👻</div>
          <div className="text-lg text-zinc-400 font-semibold mb-2">คุณถูกคัดออกแล้ว</div>
          <p className="text-xs text-zinc-600 max-w-xs">คว่ำมือถือไว้ — ห้ามพูด ห้ามให้คำใบ้ระหว่างโหวตรอบนี้</p>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black text-zinc-200 p-5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="max-w-md mx-auto">
          <div className="text-center mb-2">
            <div className="text-rose-400 text-xs tracking-[0.2em] mb-1">EMERGENCY VOTE</div>
            <Countdown endsAt={room.phaseEndsAt} />
            <div className="text-xs text-zinc-500 mt-1">โหวตแล้ว {votedCount}/{aliveCount}</div>
          </div>

          {me?.alive ? (
            <Panel className="my-4">
              <div className="space-y-2">
                {room.players.filter((p) => p.alive).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => castVote(p.id)}
                    className={`w-full text-left px-3 py-2.5 rounded border transition-colors ${
                      myVote === p.id
                        ? "border-rose-500 bg-rose-950 text-rose-200"
                        : "border-zinc-800 bg-black/40 text-zinc-300 hover:border-emerald-700"
                    }`}
                  >
                    {p.name} {p.id === myId && "(ตัวคุณเอง)"}
                  </button>
                ))}
                <button
                  onClick={() => castVote("skip")}
                  className={`w-full text-left px-3 py-2.5 rounded border transition-colors ${
                    myVote === "skip"
                      ? "border-amber-500 bg-amber-950 text-amber-200"
                      : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-emerald-700"
                  }`}
                >
                  งดออกเสียง
                </button>
              </div>
            </Panel>
          ) : (
            <div className="text-center text-zinc-500 text-sm my-6">
              คุณกำลังแกล้งตายอยู่ — โหวตไม่ได้จนกว่าจะ Reboot
            </div>
          )}
        </div>
      </div>
    );
  }

  // RESULT
  if (room.phase === PHASE.RESULT) {
    const eliminated = room.players.find((p) => p.id === room.lastEliminated);
    return (
      <div className="min-h-screen bg-black text-zinc-200 p-6 flex flex-col items-center justify-center text-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {eliminated ? (
          <>
            <div className="text-xs text-zinc-500 mb-2">ผลการโหวต</div>
            <div className="text-2xl font-bold text-zinc-100 mb-2">{eliminated.name} ถูกคัดออก</div>
            <div className={`text-lg font-semibold ${eliminated.role === ROLE.SABOTEUR ? "text-rose-400" : "text-emerald-400"}`}>
              {eliminated.role === ROLE.SABOTEUR ? "🔴 SABOTEUR" : "🟢 OPERATOR"}
            </div>
          </>
        ) : (
          <div className="text-xl text-amber-400">เสมอกัน — ไม่มีใครถูกคัดออก</div>
        )}
        {canActAsHost ? (
          <Btn onClick={hostNextRound} className="mt-8">
            ไปรอบถัดไป →
          </Btn>
        ) : (
          <div className="text-zinc-500 text-xs mt-8">รอโฮสต์ไปต่อ...</div>
        )}
      </div>
    );
  }

  // GAME OVER
  if (room.phase === PHASE.GAME_OVER) {
    const win = room.winner;
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 text-center ${win === "SABOTEURS" ? "bg-rose-950" : "bg-emerald-950"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="text-xs tracking-[0.3em] text-zinc-400 mb-3">GAME OVER</div>
        <div className={`text-3xl font-bold mb-6 ${win === "SABOTEURS" ? "text-rose-300" : "text-emerald-300"}`}>
          {win === "SABOTEURS" ? "🔴 SABOTEURS ชนะ" : "🟢 OPERATORS ชนะ"}
        </div>
        <Panel className="mb-6 text-left w-full max-w-xs">
          <div className="text-xs text-zinc-500 mb-2">บทบาททั้งหมด</div>
          {room.players.map((p) => (
            <div key={p.id} className="flex justify-between text-sm py-1">
              <span className={p.alive ? "text-zinc-200" : "text-zinc-500 line-through"}>{p.name}</span>
              <span className={p.role === ROLE.SABOTEUR ? "text-rose-400" : "text-emerald-400"}>
                {p.role === ROLE.SABOTEUR ? "SABOTEUR" : "OPERATOR"}
              </span>
            </div>
          ))}
        </Panel>
        {canActAsHost ? (
          <Btn onClick={resetToLobby}>เล่นใหม่อีกรอบ</Btn>
        ) : (
          <div className="text-zinc-500 text-xs">รอโฮสต์เริ่มรอบใหม่...</div>
        )}
      </div>
    );
  }

  return null;
}
