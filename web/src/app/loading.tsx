import React from "react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 font-mono p-4 md:p-8 flex flex-col justify-center items-center">
      <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin mb-4" />
      <span className="text-xs uppercase tracking-widest text-slate-400 animate-pulse">
        Connecting to Zilium Deterministic DAG...
      </span>
    </div>
  );
}

