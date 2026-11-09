import { notFound } from "next/navigation";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#06080D] text-slate-300 font-mono flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-xl font-bold text-white mb-2">404 - Not Found</h2>
      <p className="text-xs text-slate-500 mb-4">The requested resource does not exist.</p>
      <a href="/" className="px-4 py-2 bg-emerald-500 text-black text-xs font-bold rounded">
        Return to Zilium Terminal
      </a>
    </div>
  );
}

