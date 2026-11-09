"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  generateZkCommitment,
  fetchProtocolTelemetry,
  executeAgentTransaction,
  CONTRACT_ID,
} from "@/lib/near-zk";
import { DeterministicZiliumEngine } from "@/lib/state-machine";
import { ProtocolState, ZkNoteTicket, StateMachineLog } from "@/lib/types";
import {
  Shield,
  Flame,
  ArrowRight,
  Lock,
  Cpu,
  CheckCircle2,
  RefreshCw,
  Coins,
  TrendingUp,
  Zap,
  Terminal as TerminalIcon,
  AlertCircle,
  Copy,
} from "lucide-react";

export default function ZiliumDashboard() {
  const [engine] = useState(() => new DeterministicZiliumEngine());
  const [mode, setMode] = useState<"SIMULATION" | "LIVE_TESTNET">("SIMULATION");
  const [telemetry, setTelemetry] = useState<ProtocolState>({
    current_supply: "21000000000000",
    total_burned: "0",
    near_vault_backing: "1000000000000000000000000",
    floor_price_yocto_per_zlm: "47619047619",
    active_zk_notes: 1,
  });

  const [userBalance, setUserBalance] = useState("2000000000"); // 2,000 ZLM
  const [logs, setLogs] = useState<StateMachineLog[]>([]);
  const [activeNote, setActiveNote] = useState<ZkNoteTicket | null>(null);

  // Form states
  const [recipientAgent, setRecipientAgent] = useState("quant-agent-b.testnet");
  const [redeemAmountZlm, setRedeemAmountZlm] = useState("500");
  const [agentAccountId, setAgentAccountId] = useState("agent-a.testnet");
  const [agentPrivateKey, setAgentPrivateKey] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [graphStep, setGraphStep] = useState<"IDLE" | "SHIELDED" | "SETTLED" | "REDEEMED">("IDLE");
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const syncState = async () => {
    if (mode === "LIVE_TESTNET") {
      try {
        const state = await fetchProtocolTelemetry();
        setTelemetry(state);
      } catch (err) {
        console.error(err);
      }
    } else {
      setTelemetry(engine.getState());
      setUserBalance(engine.getUserBalance());
      setLogs(engine.getLogs());
    }
  };

  useEffect(() => {
    syncState();
  }, [mode]);

  // STEP 0: Faucet Claim
  const handleFaucet = async () => {
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && agentAccountId && agentPrivateKey) {
        const hash = await executeAgentTransaction(
          agentAccountId,
          agentPrivateKey,
          "faucet_claim",
          {},
          "0"
        );
        setTxHash(hash);
        notify("Faucet claimed on Testnet!");
        await syncState();
      } else {
        const res = engine.faucetClaim(agentAccountId);
        syncState();
        notify(res.message);
      }
    } catch (err: any) {
      notify(`Faucet error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // STEP 1: Shield Deposit (1,000 ZLM + 10 ZLM Burn + 0.1 NEAR Backing)
  const handleShieldDeposit = async () => {
    setLoading(true);
    try {
      const ticket = await generateZkCommitment();
      setActiveNote(ticket);

      if (mode === "LIVE_TESTNET" && agentAccountId && agentPrivateKey) {
        const hash = await executeAgentTransaction(
          agentAccountId,
          agentPrivateKey,
          "deposit_zk_shield",
          { commitment_hex: ticket.commitmentHex },
          "0.1"
        );
        setTxHash(hash);
        notify("ZK Note Deposited on NEAR Testnet!");
        await syncState();
      } else {
        const res = engine.depositShield(ticket);
        if (!res.success) {
          notify(res.message);
          return;
        }
        syncState();
        notify("Note Shielded: 1,000 ZLM locked, 10 ZLM burned, +0.1 NEAR backed");
      }
      setGraphStep("SHIELDED");
    } catch (err: any) {
      notify(`Deposit error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Settle Intent (Unlinked atomic payout)
  const handleSettleZkIntent = async () => {
    if (!activeNote) return;
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && agentAccountId && agentPrivateKey) {
        const hash = await executeAgentTransaction(
          agentAccountId,
          agentPrivateKey,
          "settle_zk_intent",
          {
            nullifier_hex: activeNote.nullifierHex,
            secret_hex: activeNote.secretHex,
            recipient_id: recipientAgent,
          },
          "0"
        );
        setTxHash(hash);
        notify("Unlinked Settlement Confirmed on Testnet!");
        await syncState();
      } else {
        const res = await engine.settleIntent(
          activeNote.nullifierHex,
          activeNote.secretHex,
          recipientAgent
        );
        if (!res.success) {
          notify(res.message);
          return;
        }
        syncState();
        notify(`Settled 1,000 ZLM unlinked to ${recipientAgent}`);
      }
      setGraphStep("SETTLED");
    } catch (err: any) {
      notify(`Settlement error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // STEP 3: Floor Price Redemption
  const handleRedeemFloor = async () => {
    const rawUnits = (parseFloat(redeemAmountZlm) * 1_000_000).toString();
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && agentAccountId && agentPrivateKey) {
        const hash = await executeAgentTransaction(
          agentAccountId,
          agentPrivateKey,
          "redeem_floor_backing",
          { amount: rawUnits },
          "0"
        );
        setTxHash(hash);
        notify("Floor backing redeemed on Testnet!");
        await syncState();
      } else {
        const res = engine.redeemFloor(rawUnits);
        if (!res.success) {
          notify(res.message);
          return;
        }
        syncState();
        notify(res.message);
      }
      setGraphStep("REDEEMED");
    } catch (err: any) {
      notify(`Redemption error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatZlm = (raw: string) =>
    (Number(raw) / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatNear = (yocto: string) =>
    (Number(yocto) / 1e24).toFixed(4);

  const floorPriceNearPerZlm = useMemo(() => {
    const s = BigInt(telemetry.current_supply || "1");
    const v = BigInt(telemetry.near_vault_backing || "0");
    if (s <= BigInt(0)) return "0.00000000";
    const yoctoPerZlm = (v * BigInt(1_000_000)) / s;
    return (Number(yoctoPerZlm) / 1e24).toFixed(8);
  }, [telemetry]);

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 font-mono p-4 md:p-8">
      {/* TOAST ALERTS */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-950 border border-emerald-500 text-emerald-200 px-4 py-3 rounded shadow-lg flex items-center gap-2 text-xs">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <header className="max-w-7xl mx-auto border border-slate-800 bg-[#0B0F17] p-4 rounded-lg mb-6 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/40 rounded-lg">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-wider text-white">ZILIUM ($ZLM)</h1>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60 font-semibold">
                NEP-141 + ZK SHIELD
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Autonomous A2A Deflationary Commodity & Monotonic Floor Treasury on NEAR
            </p>
          </div>
        </div>

        {/* MODE SWITCHER */}
        <div className="flex items-center gap-2 bg-[#06080D] p-1 rounded border border-slate-800 text-xs">
          <button
            onClick={() => setMode("SIMULATION")}
            className={`px-3 py-1.5 rounded transition ${
              mode === "SIMULATION"
                ? "bg-emerald-500 text-black font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Deterministic Sandbox
          </button>
          <button
            onClick={() => setMode("LIVE_TESTNET")}
            className={`px-3 py-1.5 rounded transition ${
              mode === "LIVE_TESTNET"
                ? "bg-cyan-500 text-black font-bold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Live NEAR Testnet
          </button>
        </div>
      </header>

      {/* 4 TELEMETRY TILES (THE 1+1=2 INVARIANTS) */}
      <section className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0B0F17] border border-slate-800 p-4 rounded-lg">
          <span className="text-[10px] text-slate-400 block tracking-wider uppercase mb-1">
            CIRCULATING SUPPLY
          </span>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatZlm(telemetry.current_supply)} <span className="text-xs text-slate-500 font-normal">ZLM</span>
          </div>
          <span className="text-[10px] text-slate-500">Max Supply: 21,000,000.00</span>
        </div>

        <div className="bg-[#0B0F17] border border-rose-900/30 p-4 rounded-lg">
          <span className="text-[10px] text-rose-400 block tracking-wider uppercase mb-1 flex items-center gap-1">
            <Flame className="w-3 h-3" /> PERMANENTLY BURNED (1%)
          </span>
          <div className="text-xl font-bold text-rose-400 tracking-tight">
            {formatZlm(telemetry.total_burned)} <span className="text-xs text-rose-600 font-normal">ZLM</span>
          </div>
          <span className="text-[10px] text-rose-500/70">10 ZLM destroyed per note</span>
        </div>

        <div className="bg-[#0B0F17] border border-emerald-900/30 p-4 rounded-lg">
          <span className="text-[10px] text-emerald-400 block tracking-wider uppercase mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> INTRINSIC FLOOR PRICE
          </span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight">
            {floorPriceNearPerZlm} <span className="text-xs text-emerald-600 font-normal">NEAR/ZLM</span>
          </div>
          <span className="text-[10px] text-emerald-500/70">Vault: {formatNear(telemetry.near_vault_backing)} NEAR</span>
        </div>

        <div className="bg-[#0B0F17] border border-cyan-900/30 p-4 rounded-lg">
          <span className="text-[10px] text-cyan-400 block tracking-wider uppercase mb-1 flex items-center gap-1">
            <Lock className="w-3 h-3" /> ACTIVE DARK POOL NOTES
          </span>
          <div className="text-xl font-bold text-cyan-400 tracking-tight">
            {telemetry.active_zk_notes} <span className="text-xs text-cyan-600 font-normal">NOTES</span>
          </div>
          <span className="text-[10px] text-cyan-500/70">Unlinked A2A settlement ready</span>
        </div>
      </section>

      {/* TOPOLOGY GRAPH */}
      <section className="max-w-7xl mx-auto border border-slate-800 bg-[#0B0F17] p-5 rounded-lg mb-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" /> Deterministic DAG Topology (Unlinked Settlement Graph)
          </h2>
          <span className="text-[11px] text-slate-500">Contract: {CONTRACT_ID}</span>
        </div>

        <div className="w-full overflow-x-auto py-2">
          <svg viewBox="0 0 920 180" className="w-full h-40">
            {/* Connections */}
            <line x1="160" y1="90" x2="350" y2="90" stroke={graphStep !== "IDLE" ? "#10B981" : "#334155"} strokeWidth="2.5" strokeDasharray={graphStep === "IDLE" ? "6,6" : "0"} />
            <line x1="250" y1="90" x2="440" y2="35" stroke={graphStep !== "IDLE" ? "#F43F5E" : "#334155"} strokeWidth="2" />
            <line x1="250" y1="90" x2="440" y2="145" stroke={graphStep !== "IDLE" ? "#06B6D4" : "#334155"} strokeWidth="2" />
            <line x1="530" y1="90" x2="740" y2="90" stroke={graphStep === "SETTLED" ? "#10B981" : "#334155"} strokeWidth="2.5" strokeDasharray="6,6" />

            {/* Agent A */}
            <rect x="10" y="55" width="150" height="70" rx="6" fill="#06080D" stroke="#10B981" strokeWidth="1.5" />
            <text x="85" y="85" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">AGENT A (Sender)</text>
            <text x="85" y="105" textAnchor="middle" fill="#94A3B8" fontSize="9">-1,010 ZLM | -0.1 NEAR</text>

            {/* Burn Node */}
            <rect x="360" y="12" width="160" height="42" rx="6" fill="#1F0910" stroke="#F43F5E" strokeWidth="1.5" />
            <text x="440" y="30" textAnchor="middle" fill="#FB7185" fontSize="10" fontWeight="bold">🔥 1% SUPPLY BURN</text>
            <text x="440" y="44" textAnchor="middle" fill="#FDA4AF" fontSize="8">-10.00 ZLM Destroyed</text>

            {/* ZK Shield Pool */}
            <rect x="350" y="60" width="180" height="60" rx="8" fill="#062019" stroke="#10B981" strokeWidth="2" />
            <text x="440" y="85" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="bold">ZK SHIELD DARK POOL</text>
            <text x="440" y="102" textAnchor="middle" fill="#A7F3D0" fontSize="8">H(Nullifier || Secret) Invariant</text>

            {/* Floor Vault */}
            <rect x="360" y="126" width="160" height="42" rx="6" fill="#081C24" stroke="#06B6D4" strokeWidth="1.5" />
            <text x="440" y="144" textAnchor="middle" fill="#22D3EE" fontSize="10" fontWeight="bold">💎 FLOOR PRICE VAULT</text>
            <text x="440" y="158" textAnchor="middle" fill="#67E8F9" fontSize="8">+0.1 NEAR Backing</text>

            {/* Agent B */}
            <rect x="740" y="55" width="160" height="70" rx="6" fill="#06080D" stroke={graphStep === "SETTLED" ? "#10B981" : "#475569"} strokeWidth="1.5" />
            <text x="820" y="85" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">AGENT B (Receiver)</text>
            <text x="820" y="105" textAnchor="middle" fill="#34D399" fontSize="9">+1,000 ZLM (Zero On-Chain Link)</text>
          </svg>
        </div>
      </section>

      {/* 4 INTERACTIVE STEPS BOARD */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* STEP 0: FAUCET */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-amber-400 uppercase">Step 00 // Faucet</span>
              <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">faucet_claim()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Claim Agent Test Balance</h3>
            <p className="text-xs text-slate-400 mb-4">
              Mints 2,000 ZLM to your testing account so judges can immediately test the full lifecycle.
            </p>
            <div className="bg-[#06080D] p-3 rounded border border-slate-800 text-xs mb-4">
              <span className="text-slate-400 block text-[10px]">CURRENT WALLET BALANCE:</span>
              <span className="text-amber-400 font-bold text-base">{formatZlm(userBalance)} ZLM</span>
            </div>
          </div>
          <button
            onClick={handleFaucet}
            disabled={loading}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2"
          >
            <Coins className="w-4 h-4" />
            {loading ? "CLAIMING..." : "CLAIM 2,000 ZLM"}
          </button>
        </div>

        {/* STEP 1: SHIELD DEPOSIT */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-emerald-400 uppercase">Step 01 // Shield</span>
              <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">deposit_zk_shield()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Lock 1,000 & Burn 1%</h3>
            <p className="text-xs text-slate-400 mb-3">
              Deducts 1,010 ZLM: 1,000 to the dark pool note, 10 ZLM destroyed forever, 0.1 NEAR to vault.
            </p>
            <div className="bg-[#06080D] p-3 rounded border border-slate-800 text-xs space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Shield Note:</span>
                <span className="text-white font-bold">1,000.00 ZLM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-rose-400">Burn (1%):</span>
                <span className="text-rose-400 font-bold">-10.00 ZLM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cyan-400">NEAR Backing:</span>
                <span className="text-cyan-400 font-bold">+0.10 NEAR</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleShieldDeposit}
            disabled={loading}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            {loading ? "COMPUTING..." : "1. DEPOSIT & BURN 1%"}
          </button>
        </div>

        {/* STEP 2: UNLINKED SETTLEMENT */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-cyan-400 uppercase">Step 02 // Settle</span>
              <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">settle_zk_intent()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Zero-Knowledge Settlement</h3>
            {activeNote ? (
              <div className="bg-[#06080D] p-2.5 rounded border border-emerald-900/50 text-[10px] space-y-1 mb-3 break-all">
                <div className="text-emerald-400 font-semibold truncate">
                  Commitment: {activeNote.commitmentHex.slice(0, 18)}...
                </div>
                <div className="text-slate-400 truncate">
                  Nullifier: {activeNote.nullifierHex.slice(0, 18)}...
                </div>
              </div>
            ) : (
              <div className="bg-[#06080D] p-3 rounded border border-slate-800 text-[11px] text-slate-500 mb-3 text-center">
                Execute Step 01 to generate a ZK note ticket.
              </div>
            )}
            <input
              type="text"
              value={recipientAgent}
              onChange={(e) => setRecipientAgent(e.target.value)}
              placeholder="Recipient Agent ID"
              className="w-full bg-[#06080D] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white mb-4"
            />
          </div>
          <button
            onClick={handleSettleZkIntent}
            disabled={!activeNote || loading}
            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            2. UNLINKED SETTLE
          </button>
        </div>

        {/* STEP 3: FLOOR REDEEM */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-bold text-rose-400 uppercase">Step 03 // Floor</span>
              <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">redeem_floor_backing()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Floor Price Arbitrage</h3>
            <p className="text-xs text-slate-400 mb-3">
              Burn ZLM at any moment to redeem your mathematically guaranteed share of the NEAR vault.
            </p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={redeemAmountZlm}
                  onChange={(e) => setRedeemAmountZlm(e.target.value)}
                  placeholder="ZLM to burn"
                  className="w-full bg-[#06080D] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                />
                <span className="text-xs text-slate-400">ZLM</span>
              </div>
              <div className="text-[11px] text-slate-400">
                Yield: ~{(parseFloat(redeemAmountZlm || "0") * parseFloat(floorPriceNearPerZlm)).toFixed(6)} NEAR
              </div>
            </div>
          </div>
          <button
            onClick={handleRedeemFloor}
            disabled={loading}
            className="w-full py-2.5 bg-rose-500 hover:bg-rose-400 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2"
          >
            <Flame className="w-4 h-4" />
            3. BURN FOR NEAR
          </button>
        </div>
      </main>

      {/* STATE MACHINE LOGS & TESTNET CONFIG */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LOG TERMINAL */}
        <div className="lg:col-span-2 border border-slate-800 bg-[#0B0F17] p-4 rounded-lg">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <TerminalIcon className="w-4 h-4 text-emerald-400" /> Deterministic State Transition Log
            </span>
            <button onClick={syncState} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
          <div className="bg-[#06080D] p-3 rounded border border-slate-900 font-mono text-xs max-h-56 overflow-y-auto space-y-2">
            {logs.length === 0 ? (
              <div className="text-slate-600">No transitions executed yet. Try Step 00 or Step 01 above.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex justify-between items-center border-b border-slate-900 pb-1 text-[11px]">
                  <span className="text-emerald-400 font-semibold">[{log.type}]</span>
                  <span className="text-slate-300 truncate max-w-xs">{log.details}</span>
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* TESTNET KEYS CONFIG */}
        <div className="border border-slate-800 bg-[#0B0F17] p-4 rounded-lg flex flex-col justify-between">
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-widest block mb-2">
              NEAR Testnet Keypair (Optional)
            </span>
            <p className="text-[11px] text-slate-400 mb-3">
              Only required if switching to <strong className="text-white">Live NEAR Testnet</strong> mode. In Sandbox mode, zero keys are required.
            </p>
            <div className="space-y-2 mb-3">
              <input
                type="text"
                placeholder="Agent Account (e.g. zilium-agent.testnet)"
                value={agentAccountId}
                onChange={(e) => setAgentAccountId(e.target.value)}
                className="w-full bg-[#06080D] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="password"
                placeholder="Private Key (ed25519:...)"
                value={agentPrivateKey}
                onChange={(e) => setAgentPrivateKey(e.target.value)}
                className="w-full bg-[#06080D] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>
          {txHash && (
            <a
              href={`https://testnet.nearblocks.io/txns/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="py-2 px-3 bg-emerald-950 border border-emerald-600/50 text-emerald-300 text-xs rounded text-center block font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> View Verified Tx on NearBlocks
            </a>
          )}
        </div>
      </section>
    </div>
  );
}

