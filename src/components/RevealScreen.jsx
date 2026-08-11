import { useState } from "react";
import { ROLE } from "../game/constants.js";
import { Btn } from "./Atoms.jsx";

export function RevealScreen({ me, room, isHost, onContinue }) {
  const [held, setHeld] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const isSab = me?.role === ROLE.SABOTEUR;
  const sabTeammates = room.players.filter((p) => p.role === ROLE.SABOTEUR && p.id !== me?.id);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-black select-none"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {!held ? (
        <>
          <div className="text-xs tracking-[0.3em] text-zinc-500 mb-6">IDENTITY LOCKED</div>
          <div className="text-6xl mb-6">🔒</div>
          <p className="text-zinc-400 text-sm max-w-xs mb-8">
            เอามือถือหันเข้าตัวเอง ห้ามให้คนข้างๆ เห็นจอนะ แล้วกดค้างไว้เพื่อดูบทบาท
          </p>
          <button
            onMouseDown={() => setHeld(true)}
            onTouchStart={() => setHeld(true)}
            className="px-8 py-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold border border-zinc-700 active:scale-95 transition-transform"
          >
            👆 กดค้างเพื่อดูบทบาท
          </button>
        </>
      ) : (
        <div
          className="w-full max-w-xs"
          onMouseUp={() => setHeld(false)}
          onMouseLeave={() => setHeld(false)}
          onTouchEnd={() => setHeld(false)}
        >
          <div className={`rounded-xl p-6 ${isSab ? "bg-rose-950 border border-rose-800" : "bg-emerald-950 border border-emerald-800"}`}>
            <div className="text-xs tracking-[0.3em] text-zinc-400 mb-3">DECRYPTED</div>
            <div className={`text-2xl font-bold mb-3 ${isSab ? "text-rose-300" : "text-emerald-300"}`}>
              {isSab ? "🔴 SABOTEUR" : "🟢 OPERATOR"}
            </div>
            <p className="text-zinc-300 text-xs mb-4">
              {isSab
                ? "กำจัดฝ่ายตรงข้ามให้เหลือเท่ากับหรือน้อยกว่าพวกคุณ โดยไม่ถูกจับได้"
                : "หาตัว Saboteur ให้เจอและโหวตออกให้หมดก่อนที่พวกเขาจะคุมเกมได้"}
            </p>
            {isSab && sabTeammates.length > 0 && (
              <div className="text-xs text-rose-300 bg-black/30 rounded px-3 py-2">
                พวกพ้อง: {sabTeammates.map((p) => p.name).join(", ")}
              </div>
            )}
          </div>
          <div className="text-xs text-zinc-600 mt-3">ปล่อยนิ้วเพื่อซ่อนกลับ</div>
        </div>
      )}

      {!held && (
        <div className="mt-10 w-full max-w-xs">
          {!confirmed ? (
            <Btn onClick={() => setConfirmed(true)} className="w-full">
              ✅ ดูแล้ว จำได้แล้ว
            </Btn>
          ) : (
            <div className="text-emerald-500 text-sm">✓ พร้อมแล้ว — รอคนอื่น...</div>
          )}
          {isHost && (
            <Btn variant="ghost" onClick={onContinue} className="w-full mt-3 text-xs">
              เริ่ม Live Phase (กดเมื่อทุกคนดูครบแล้ว)
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}
