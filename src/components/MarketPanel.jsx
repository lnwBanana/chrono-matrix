import { useState } from "react";
import { NODES } from "../game/constants.js";
import { Panel, Btn } from "./Atoms.jsx";

export function MarketPanel({ room, myId, me, onPost, onBuy, onRevealFree, onVerify }) {
  const [tab, setTab] = useState("market");
  const [forgeNode, setForgeNode] = useState(NODES[0]);
  const [forgeText, setForgeText] = useState("");
  const [forgePrice, setForgePrice] = useState(30);
  const [forgeCode, setForgeCode] = useState("");
  const [verifyInput, setVerifyInput] = useState("");

  const myWitnessedEvents = room.trueEvents.filter((e) => (e.witnesses || []).includes(myId));
  const alreadyListedEventIds = new Set(
    room.market.filter((l) => l.linkedEventId).map((l) => l.linkedEventId)
  );

  function sellTrueEvent(ev, price) {
    onPost({ kind: "true", node: ev.node, text: ev.text, price, linkedEventId: ev.id });
  }

  function postForgery() {
    if (!forgeText.trim()) return;
    onPost({ kind: "forged", node: forgeNode, text: forgeText.trim(), price: forgePrice, fakeCode: forgeCode.trim() });
    setForgeText("");
    setForgeCode("");
  }

  return (
    <Panel className="mb-4">
      <div className="flex gap-1 mb-3 text-xs flex-wrap">
        {[
          ["market", "🛒 ตลาด"],
          ["witness", `👁️ ที่คุณเห็น (${myWitnessedEvents.length})`],
          ["post", "✍️ ปลอมข้อมูล"],
          ["verify", "🔍 ตรวจรหัส"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-2 py-1.5 rounded ${tab === key ? "bg-emerald-800 text-emerald-100" : "bg-zinc-900 text-zinc-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "market" && (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {room.market.length === 0 && (
            <div className="text-zinc-600 text-xs text-center py-4">ยังไม่มีใครโพสต์ข้อมูลในตลาด</div>
          )}
          {room.market
            .slice()
            .reverse()
            .map((l) => {
              const seller = room.players.find((p) => p.id === l.sellerId);
              const bought = (l.buyers || []).includes(myId);
              const isMine = l.sellerId === myId;
              const revealed = bought || isMine;
              return (
                <div key={l.id} className="bg-black/40 border border-zinc-800 rounded px-3 py-2">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-zinc-500">
                      จาก {seller?.name || "?"} · {l.node}
                    </span>
                    <span className="text-xs text-amber-400">{l.price} Cr</span>
                  </div>
                  <div className="text-sm text-zinc-200 mb-2">
                    {revealed ? l.text : "🔒 ซื้อเพื่อดูเนื้อหา"}
                  </div>
                  {revealed && l.verifyCode && (
                    <div className="text-xs bg-black/50 rounded px-2 py-1 mb-2 font-mono text-cyan-400">
                      รหัสยืนยัน: {l.verifyCode}
                    </div>
                  )}
                  {!revealed && !isMine && (
                    <button
                      onClick={() => onBuy(l.id)}
                      disabled={(me?.credits ?? 0) < l.price}
                      className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-black font-semibold px-2 py-1 rounded"
                    >
                      ซื้อ ({l.price} Cr)
                    </button>
                  )}
                  {isMine && (
                    <span className="text-xs text-zinc-600">ขายไปแล้ว {(l.buyers || []).length} คน</span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {tab === "witness" && (
        <div className="space-y-2 max-h-56 overflow-y-auto">
          <div className="text-xs text-zinc-500 mb-1">
            คุณบังเอิญเห็นเหตุการณ์เหล่านี้จริง — เลือกแฉฟรี หรือขายเก็บเงินพร้อมรหัสยืนยัน
          </div>
          {myWitnessedEvents.length === 0 && (
            <div className="text-zinc-600 text-xs text-center py-4">ยังไม่เห็นอะไรเป็นพยาน รอ event ถัดไป</div>
          )}
          {myWitnessedEvents.map((ev) => {
            const listed = alreadyListedEventIds.has(ev.id);
            return (
              <div key={ev.id} className="bg-emerald-950/40 border border-emerald-900 rounded px-3 py-2">
                <div className="text-xs text-emerald-500 mb-1">{ev.node}</div>
                <div className="text-sm text-zinc-100 mb-1">{ev.text}</div>
                <div className="text-xs font-mono text-cyan-500 mb-2">รหัส: {ev.verifyCode}</div>
                {listed ? (
                  <span className="text-xs text-zinc-600">วางขายในตลาดแล้ว</span>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onRevealFree(ev.id)}
                      className="text-xs bg-emerald-800 hover:bg-emerald-700 px-2 py-1 rounded text-emerald-100"
                    >
                      แฉฟรี (ไม่ให้รหัส)
                    </button>
                    <button
                      onClick={() => sellTrueEvent(ev, 40)}
                      className="text-xs bg-amber-700 hover:bg-amber-600 px-2 py-1 rounded text-black font-semibold"
                    >
                      ขาย 40 Cr (พร้อมรหัส)
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "post" && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500">
            สร้างข้อมูลปลอมขึ้นมาขาย — ใส่ "รหัสยืนยัน" ปลอมๆ ให้ดูน่าเชื่อได้ แต่มันจะไม่ผ่านการตรวจสอบจริง
          </div>
          <select
            value={forgeNode}
            onChange={(e) => setForgeNode(e.target.value)}
            className="w-full bg-black border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"
          >
            {NODES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <input
            value={forgeText}
            onChange={(e) => setForgeText(e.target.value)}
            placeholder="เช่น เห็นใครบางคนเดินผ่านตอนนาทีที่ 2"
            maxLength={80}
            className="w-full bg-black border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"
          />
          <input
            value={forgeCode}
            onChange={(e) => setForgeCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="รหัสยืนยัน (ไม่บังคับ เช่น 3F9A2C)"
            maxLength={6}
            className="w-full bg-black border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 font-mono"
          />
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={forgePrice}
              onChange={(e) => setForgePrice(Number(e.target.value))}
              min={0}
              max={200}
              className="w-24 bg-black border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200"
            />
            <span className="text-xs text-zinc-500">Credits</span>
            <Btn onClick={postForgery} className="ml-auto text-xs px-3 py-1.5">
              วางขาย
            </Btn>
          </div>
        </div>
      )}

      {tab === "verify" && (
        <div className="space-y-3">
          <div className="text-xs text-zinc-500">
            ใครก็ตรวจได้ ผลตรวจจะขึ้น Log สาธารณะให้ทุกคนเห็นทันที — ใช้แฉของปลอมกลางวงได้เลย
          </div>
          <div className="flex gap-2">
            <input
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ใส่รหัส 6 หลัก"
              className="flex-1 bg-black border border-cyan-900 rounded px-2 py-1.5 text-sm text-cyan-200 font-mono"
            />
            <Btn
              onClick={() => {
                if (verifyInput.trim()) {
                  onVerify(verifyInput.trim());
                  setVerifyInput("");
                }
              }}
              className="text-xs px-3 py-1.5"
            >
              ตรวจสอบ
            </Btn>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {(room.verifyAttempts || []).slice().reverse().slice(0, 6).map((v, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded flex justify-between ${v.result === "valid" ? "bg-emerald-950 text-emerald-300" : "bg-rose-950 text-rose-300"}`}>
                <span>{v.playerName}: {v.code}</span>
                <span>{v.result === "valid" ? "✅ จริง" : "❌ ปลอม"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
