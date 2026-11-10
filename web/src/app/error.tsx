"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Zilium Dashboard Runtime Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 font-mono p-6 flex flex-col justify-center items-center text-center">
      <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-full mb-4 text-rose-400">
        <AlertTriangle className="w-8 h-8" />
      </div>
      <h2 className="text-lg font-bold text-white mb-2">Protocol Interface Error</h2>
      <p className="text-xs text-slate-400 max-w-md mb-6">
        {error.message || "An unexpected error occurred while communicating with the NEAR RPC node."}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded transition flex items-center gap-2"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Reconnect Session
      </button>
    </div>
  );
}

