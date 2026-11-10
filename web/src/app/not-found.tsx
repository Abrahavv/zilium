import React from "react";
import Link from "next/link";
import { Terminal } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#06080D] text-slate-300 font-mono flex flex-col items-center justify-center p-6 text-center">
      <div className="p-3 bg-cyan-500/10 border border-cyan-500/40 rounded-full mb-4 text-cyan-400">
        <Terminal className="w-8 h-8" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">404 - Node Not Found</h2>
      <p className="text-xs text-slate-500 mb-6">The requested protocol resource or route does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded transition"
      >
        Return to Zilium Terminal
      </Link>
    </div>
  );
}
