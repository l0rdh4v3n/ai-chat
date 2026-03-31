"use client";

import { useState } from "react";

import ArtStudio from "@/components/ArtStudio";
import ChatApp from "@/components/ChatApp";

type Mode = "chat" | "studio";

export default function Page() {
  const [mode, setMode] = useState<Mode>("chat");

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 p-1 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <button
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${mode === "chat" ? "bg-white text-slate-950" : "text-white/70 hover:text-white"}`}
            type="button"
            onClick={() => setMode("chat")}
          >
            AI Chat
          </button>
          <button
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition ${mode === "studio" ? "bg-white text-slate-950" : "text-white/70 hover:text-white"}`}
            type="button"
            onClick={() => setMode("studio")}
          >
            Art Studio
          </button>
        </div>
      </div>

      {mode === "chat" ? <ChatApp /> : <ArtStudio />}
    </main>
  );
}
