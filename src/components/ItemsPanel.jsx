import { useState } from "react";
import { ITEM_CATALOG } from "../game/constants.js";
import { Panel, Btn } from "./Atoms.jsx";

export function ItemsPanel({ me, room, onBuyItem, onActivateFakeDead, onFrameSetup }) {
  const [frameTarget, setFrameTarget] = useState("");
  if (!me) return null;

  const others = room.players.filter((p) => p.alive && p.id !== me.id);

  return (
    <Panel className="mb-4 border-indigo-900/60">
      <div className="text-xs text-indigo-400 mb-3">🛠️ ไอเทมลับ (ตลาดมืด)</div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between bg-black/40 rounded px-3 py-2">
          <div>
            <div className="text-sm text-zinc-200">{ITEM_CATALOG.intercept.name}</div>
            <div className="text-xs text-zinc-500">{ITEM_CATALOG.intercept.desc}</div>
          </div>
          {me.hasIntercept ? (
            <span className="text-xs text-emerald-400 whitespace-nowrap ml-2">พร้อมใช้ ✓</span>
          ) : (
            <Btn
              onClick={() => onBuyItem("intercept")}
              disabled={me.credits < ITEM_CATALOG.intercept.cost}
              className="text-xs px-2 py-1 whitespace-nowrap ml-2"
            >
              ซื้อ {ITEM_CATALOG.intercept.cost}
            </Btn>
          )}
        </div>

        <div className="flex items-center justify-between bg-black/40 rounded px-3 py-2">
          <div>
            <div className="text-sm text-zinc-200">{ITEM_CATALOG.fakeDead.name}</div>
            <div className="text-xs text-zinc-500">{ITEM_CATALOG.fakeDead.desc}</div>
          </div>
          {me.hasFakeDead ? (
            <Btn onClick={onActivateFakeDead} className="text-xs px-2 py-1 whitespace-nowrap ml-2">
              ใช้เลย
            </Btn>
          ) : (
            <Btn
              onClick={() => onBuyItem("fakeDead")}
              disabled={me.credits < ITEM_CATALOG.fakeDead.cost}
              variant="ghost"
              className="text-xs px-2 py-1 whitespace-nowrap ml-2"
            >
              ซื้อ {ITEM_CATALOG.fakeDead.cost}
            </Btn>
          )}
        </div>
      </div>

      <div className="bg-black/40 rounded px-3 py-2">
        <div className="text-sm text-zinc-200 mb-1">{ITEM_CATALOG.frame.name}</div>
        <div className="text-xs text-zinc-500 mb-2">{ITEM_CATALOG.frame.desc}</div>
        <div className="flex gap-2">
          <select
            value={frameTarget}
            onChange={(e) => setFrameTarget(e.target.value)}
            className="flex-1 bg-black border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="">เลือกเป้าหมาย</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Btn
            onClick={() => frameTarget && onFrameSetup(frameTarget)}
            disabled={!frameTarget || me.credits < ITEM_CATALOG.frame.cost}
            variant="danger"
            className="text-xs px-3 py-1.5 whitespace-nowrap"
          >
            ใส่ร้าย ({ITEM_CATALOG.frame.cost})
          </Btn>
        </div>
      </div>
    </Panel>
  );
}
