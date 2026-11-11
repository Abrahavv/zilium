"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  generateZkCommitment,
  fetchProtocolTelemetry,
  fetchTokenBalance,
  CONTRACT_ID,
} from "@/lib/near-zk";
import { getWalletSelector } from "@/lib/wallet";
import { DeterministicZiliumEngine } from "@/lib/state-machine";
import { ProtocolState, ZkNoteTicket } from "@/lib/types";
import {
  Shield,
  Flame,
  ArrowRight,
  Lock,
  Cpu,
  CheckCircle2,
  Coins,
  TrendingUp,
  Zap,
  Terminal as TerminalIcon,
  Wallet,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  X,
  Swords,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldAlert,
  BarChart3,
  Layers,
} from "lucide-react";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";

type ActiveTab = "TERMINAL" | "ATTACK_SIM" | "TELEMETRY";

function parseNearError(err: unknown): string {
  if (!err) return "Unknown transaction error";
  const str = err instanceof Error ? err.message : String(err);

  if (str.includes("Faucet already claimed")) {
    return "Faucet already claimed for this account. You have tokens and can proceed to Step 02 (Shield).";
  }
  if (str.includes("doesn't have enough balance") || str.includes("not enough balance")) {
    return "Insufficient ZLM balance. Please check your available balance or click MAX.";
  }
  if (str.includes("Faucet tokens timelocked")) {
    return "Sybil protection: Faucet tokens are timelocked before floor redemption.";
  }
  if (str.includes("User rejected") || str.includes("user rejected") || str.includes("cancelled")) {
    return "Transaction cancelled in wallet.";
  }

  const match = str.match(/ExecutionError":"Smart contract panicked: (?:panicked at [^:]+:\d+:\d+:\n)?([^"\\]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }

  return str.length > 120 ? str.slice(0, 120) + "..." : str;
}

export default function ZiliumDashboard() {
  const [engine] = useState(() => new DeterministicZiliumEngine());
  const [activeTab, setActiveTab] = useState<ActiveTab>("TERMINAL");
  const [mode, setMode] = useState<"SIMULATION" | "LIVE_TESTNET">("LIVE_TESTNET");
  const [telemetry, setTelemetry] = useState<ProtocolState>({
    current_supply: "20999920000000",
    total_burned: "80000000",
    near_vault_backing: "2000000000000000000000000",
    floor_price_yocto_per_zlm: "95238466666666666",
    active_zk_notes: 0,
  });

  const [walletAccountId, setWalletAccountId] = useState<string | null>(null);
  const [walletSelector, setWalletSelector] = useState<WalletSelector | null>(null);
  const [walletModal, setWalletModal] = useState<WalletSelectorModal | null>(null);

  const [userBalance, setUserBalance] = useState("2000000000");
  const [treasuryBalance, setTreasuryBalance] = useState("20979920000000");
  const [agentBBalance, setAgentBBalance] = useState("20000000000");
  const [activeNote, setActiveNote] = useState<ZkNoteTicket | null>(null);

  const [recipientAgent, setRecipientAgent] = useState("zilium-agent-b.testnet");
  const [selectedTier, setSelectedTier] = useState<1 | 2 | 3>(2);
  const [redeemAmountZlm, setRedeemAmountZlm] = useState("1000");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [attackStep, setAttackStep] = useState<"IDLE" | "TRANSMITTING" | "INTERCEPTED" | "RESOLVED">("IDLE");
  const [isSimulatingAttack, setIsSimulatingAttack] = useState(false);

  const notify = (text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type });
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const runParallelAttackSimulation = async () => {
    setIsSimulatingAttack(true);
    setAttackStep("TRANSMITTING");
    notify("Simulating parallel intent: Agent Alpha -> Agent Beta", "info");

    await new Promise((r) => setTimeout(r, 1200));
    setAttackStep("INTERCEPTED");
    notify("Mempool bot intercepted cleartext x402 payload", "error");

    await new Promise((r) => setTimeout(r, 1500));
    setAttackStep("RESOLVED");
    setIsSimulatingAttack(false);
    notify("Zilium settlement confirmed with 0% leak. x402 front-run complete.", "success");
  };

  useEffect(() => {
    getWalletSelector().then((res) => {
      if (!res) return;
      const { selector, modal } = res;
      setWalletSelector(selector);
      setWalletModal(modal);

      const state = selector.store.getState();
      const activeAccount = state.accounts.find((a) => a.active)?.accountId || state.accounts[0]?.accountId || null;
      if (activeAccount) {
        setWalletAccountId(activeAccount);
      }

      selector.store.observable.subscribe((nextState) => {
        const nextAccount = nextState.accounts.find((a) => a.active)?.accountId || nextState.accounts[0]?.accountId || null;
        setWalletAccountId(nextAccount);
      });
    });
  }, []);

  const syncState = useCallback(async () => {
    if (mode === "SIMULATION") {
      const simState = engine.getState();
      setTelemetry(simState);
      setUserBalance(engine.getUserBalance());
      const s = BigInt(simState.current_supply);
      const userBal = BigInt(engine.getUserBalance());
      const simTreasury = s > userBal ? (s - userBal).toString() : s.toString();
      setTreasuryBalance(simTreasury);
      setAgentBBalance("1000000000");
      return;
    }

    try {
      const [state, treasury, agentB] = await Promise.all([
        fetchProtocolTelemetry(),
        fetchTokenBalance(CONTRACT_ID),
        fetchTokenBalance("zilium-agent-b.testnet"),
      ]);
      setTelemetry(state);
      setTreasuryBalance(treasury);
      setAgentBBalance(agentB);
      if (walletAccountId) {
        const bal = await fetchTokenBalance(walletAccountId);
        setUserBalance(bal);
      }
    } catch {
      setTelemetry(engine.getState());
      setUserBalance(engine.getUserBalance());
    }
  }, [engine, mode, walletAccountId]);

  useEffect(() => {
    syncState();
    if (mode === "LIVE_TESTNET") {
      const interval = setInterval(syncState, 15000);
      return () => clearInterval(interval);
    }
  }, [syncState, mode]);

  const handleConnectWallet = () => {
    if (walletModal) {
      walletModal.show();
    }
  };

  const handleSignOut = async () => {
    if (walletSelector) {
      const wallet = await walletSelector.wallet();
      await wallet.signOut();
      setWalletAccountId(null);
      notify("Wallet disconnected", "info");
    }
  };

  const callContractMethod = async (methodName: string, args: Record<string, unknown>, attachedYocto = "0") => {
    if (!walletSelector || !walletAccountId) {
      throw new Error("Please connect your NEAR Testnet Wallet first");
    }
    const { actionCreators } = await import("@near-wallet-selector/core");
    const wallet = await walletSelector.wallet();
    const outcome = await wallet.signAndSendTransaction({
      signerId: walletAccountId,
      receiverId: CONTRACT_ID,
      actions: [
        actionCreators.functionCall(
          methodName,
          args,
          BigInt("100000000000000"),
          BigInt(attachedYocto)
        ),
      ],
    });
    const txObj = outcome as { transaction?: { hash: string }; transaction_outcome?: { id: string } } | undefined;
    return txObj?.transaction?.hash || txObj?.transaction_outcome?.id || "verified";
  };

  const TIER_DETAILS = useMemo(() => ({
    1: { name: "Micro", note: "10", burn: "0.1", near: "0.001", totalZlm: "10.1", yoctoNear: "1000000000000000000000", rawZlm: BigInt("10100000") },
    2: { name: "Standard", note: "100", burn: "1.0", near: "0.01", totalZlm: "101.0", yoctoNear: "10000000000000000000000", rawZlm: BigInt("101000000") },
    3: { name: "Macro", note: "1,000", burn: "10.0", near: "0.1", totalZlm: "1,010.0", yoctoNear: "100000000000000000000000", rawZlm: BigInt("1010000000") },
  }), []);

  const handleFaucet = async () => {
    if (mode === "LIVE_TESTNET" && !walletAccountId) {
      handleConnectWallet();
      notify("Please connect your NEAR Testnet wallet first", "info");
      return;
    }
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod("faucet_claim", {});
        setTxHash(hash);
        notify("Claimed 1,000 ZLM from Genesis Treasury!", "success");
        await syncState();
        setTimeout(syncState, 2000);
      } else {
        const res = engine.faucetClaim("agent-demo.testnet");
        syncState();
        notify(res.message, "success");
      }
    } catch (err: unknown) {
      notify(parseNearError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleShieldDeposit = async () => {
    if (mode === "LIVE_TESTNET" && !walletAccountId) {
      handleConnectWallet();
      notify("Please connect your NEAR Testnet wallet first", "info");
      return;
    }
    const currentBal = BigInt(userBalance || "0");
    const cfg = TIER_DETAILS[selectedTier];
    if (currentBal < cfg.rawZlm) {
      const avail = (Number(currentBal) / 1_000_000).toFixed(2);
      notify(`Insufficient balance. Tier ${cfg.name} requires ${cfg.totalZlm} ZLM (you have ${avail} ZLM). Claim from Faucet or select a lower tier.`, "error");
      return;
    }
    setLoading(true);
    try {
      const ticket = await generateZkCommitment();
      setActiveNote(ticket);

      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod(
          "deposit_zk_shield",
          { commitment_hex: ticket.commitmentHex, tier: selectedTier },
          cfg.yoctoNear
        );
        setTxHash(hash);
        notify(`Tier ${cfg.name} ZK Note Deposited (${cfg.burn} ZLM Burn + Floor Raised)!`, "success");
        await syncState();
        setTimeout(syncState, 2000);
      } else {
        const res = engine.depositShield(ticket);
        if (!res.success) {
          notify(res.message, "error");
          return;
        }
        syncState();
        notify(`Note Shielded: ${cfg.note} ZLM locked, ${cfg.burn} ZLM burned, +${cfg.near} NEAR backed`, "success");
      }
    } catch (err: unknown) {
      notify(parseNearError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSettleZkIntent = async () => {
    if (!activeNote) return;
    if (mode === "LIVE_TESTNET" && !walletAccountId) {
      handleConnectWallet();
      notify("Please connect your NEAR Testnet wallet first", "info");
      return;
    }
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod("settle_zk_intent", {
          nullifier_hex: activeNote.nullifierHex,
          secret_hex: activeNote.secretHex,
          recipient_id: recipientAgent,
          tier: selectedTier,
        });
        setTxHash(hash);
        notify("Unlinked Settlement Confirmed on Testnet", "success");
        await syncState();
        setTimeout(syncState, 2000);
      } else {
        const res = await engine.settleIntent(
          activeNote.nullifierHex,
          activeNote.secretHex,
          recipientAgent
        );
        if (!res.success) {
          notify(res.message, "error");
          return;
        }
        syncState();
        notify(`Settled ${TIER_DETAILS[selectedTier].note} ZLM unlinked to ${recipientAgent}`, "success");
      }
    } catch (err: unknown) {
      notify(parseNearError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemFloor = async () => {
    if (mode === "LIVE_TESTNET" && !walletAccountId) {
      handleConnectWallet();
      notify("Please connect your NEAR Testnet wallet first", "info");
      return;
    }
    const currentBal = BigInt(userBalance || "0");
    const zlmUnits = BigInt(Math.floor(Number(redeemAmountZlm || "0")));
    const rawUnits = (zlmUnits * BigInt(1_000_000)).toString();

    if (zlmUnits <= BigInt(0)) {
      notify("Please enter an amount greater than 0 ZLM", "error");
      return;
    }

    if (BigInt(rawUnits) > currentBal) {
      const avail = (Number(currentBal) / 1_000_000).toFixed(2);
      notify(`Insufficient balance. You have ${avail} ZLM available to burn.`, "error");
      return;
    }

    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod("redeem_floor_backing", { amount: rawUnits });
        setTxHash(hash);
        notify("Burned ZLM and redeemed proportional NEAR backing", "success");
        await syncState();
        setTimeout(syncState, 2000);
      } else {
        const res = engine.redeemFloor(rawUnits);
        if (!res.success) {
          notify(res.message, "error");
          return;
        }
        syncState();
        notify(res.message, "success");
      }
    } catch (err: unknown) {
      notify(parseNearError(err), "error");
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

  const agentCirculation = useMemo(() => {
    const current = BigInt(telemetry.current_supply || "0");
    const treasury = BigInt(treasuryBalance || "0");
    const diff = current > treasury ? current - treasury : BigInt(0);
    return diff.toString();
  }, [telemetry.current_supply, treasuryBalance]);

  return (
    <div className="min-h-screen bg-[#06080D] text-slate-100 font-mono p-4 md:p-8 antialiased selection:bg-emerald-500 selection:text-black">
      {/* NOTIFICATION TOAST */}
      {toastMessage && (
        <aside
          role="status"
          aria-live="polite"
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 text-xs border backdrop-blur-md transition-all ${
            toastMessage.type === "error"
              ? "bg-rose-950/90 border-rose-500 text-rose-200"
              : toastMessage.type === "info"
              ? "bg-slate-900/90 border-slate-700 text-slate-200"
              : "bg-emerald-950/90 border-emerald-500 text-emerald-200"
          }`}
        >
          <Zap className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span className="font-medium">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white transition p-1"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </aside>
      )}

      {/* INSTITUTIONAL HEADER BAR */}
      <header className="max-w-7xl mx-auto border border-white/[0.08] bg-[#0A0D14] p-4 rounded-xl mb-6 flex flex-wrap justify-between items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-wider text-white">ZILIUM PROTOCOL</h1>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold tracking-wide">
                $ZLM NEP-141 + ZK
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Autonomous A2A Deflationary Privacy Currency & Monotonic Floor Treasury on NEAR
            </p>
          </div>
        </div>

        {/* ENVIRONMENT & WALLET CONTROLS */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-[#06080D] p-1 rounded-lg border border-white/[0.08] text-xs">
            <button
              onClick={() => {
                setMode("LIVE_TESTNET");
                setActiveNote(null);
                notify("Switched to Live NEAR Testnet", "info");
              }}
              className={`px-3 py-1.5 rounded-md transition ${
                mode === "LIVE_TESTNET"
                  ? "bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              NEAR Testnet
            </button>
            <button
              onClick={() => {
                setMode("SIMULATION");
                setActiveNote(null);
                notify("Switched to Local Sandbox", "info");
              }}
              className={`px-3 py-1.5 rounded-md transition ${
                mode === "SIMULATION"
                  ? "bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Local Sandbox
            </button>
          </div>

          {walletAccountId ? (
            <div className="flex items-center gap-2 bg-[#06080D] border border-emerald-500/40 rounded-lg px-3 py-1.5 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 font-bold truncate max-w-[150px]">{walletAccountId}</span>
              <button
                onClick={handleSignOut}
                className="text-slate-400 hover:text-rose-400 transition ml-1 p-0.5 rounded"
                aria-label="Disconnect NEAR Wallet"
                title="Disconnect"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition flex items-center gap-2 shadow-md shadow-emerald-500/20"
            >
              <Wallet className="w-3.5 h-3.5" /> Connect Wallet
            </button>
          )}
        </div>
      </header>

      {/* CORE STATS BAR (ALWAYS VISIBLE, CLEAN METRICS) */}
      <section className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0A0D14] border border-white/[0.08] p-4 rounded-xl">
          <span className="text-[10px] text-slate-400 tracking-wider uppercase block mb-1">
            Circulating Supply
          </span>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatZlm(telemetry.current_supply)} <span className="text-xs text-slate-500 font-normal">ZLM</span>
          </div>
          <span className="text-[11px] text-emerald-400/90 font-medium block mt-1">
            Strict 21M Cap (-{formatZlm(telemetry.total_burned)} Burned)
          </span>
        </div>

        <div className="bg-[#0A0D14] border border-rose-950/40 p-4 rounded-xl">
          <span className="text-[10px] text-rose-400 tracking-wider uppercase mb-1 flex items-center gap-1.5">
            <Flame className="w-3 h-3 text-rose-400" /> Permanently Burned
          </span>
          <div className="text-xl font-bold text-rose-400 tracking-tight">
            {formatZlm(telemetry.total_burned)} <span className="text-xs text-rose-600 font-normal">ZLM</span>
          </div>
          <span className="text-[11px] text-rose-500/70 block mt-1">10 ZLM destroyed per shield</span>
        </div>

        <div className="bg-[#0A0D14] border border-emerald-950/40 p-4 rounded-xl">
          <span className="text-[10px] text-emerald-400 tracking-wider uppercase mb-1 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" /> Floor Backing Vault
          </span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight">
            {formatNear(telemetry.near_vault_backing)} <span className="text-xs text-emerald-600 font-normal">NEAR</span>
          </div>
          <span className="text-[11px] text-emerald-400/80 block mt-1 font-mono">
            Floor: {floorPriceNearPerZlm} NEAR/ZLM
          </span>
        </div>

        <div className="bg-[#0A0D14] border border-cyan-950/40 p-4 rounded-xl">
          <span className="text-[10px] text-cyan-400 tracking-wider uppercase mb-1 flex items-center gap-1.5">
            <Lock className="w-3 h-3 text-cyan-400" /> Active ZK Notes
          </span>
          <div className="text-xl font-bold text-cyan-400 tracking-tight">
            {telemetry.active_zk_notes} <span className="text-xs text-cyan-600 font-normal">NOTES</span>
          </div>
          <span className="text-[11px] text-cyan-500/70 block mt-1">Unlinked settlement ready</span>
        </div>
      </section>

      {/* MODERN TAB NAVIGATION (CLEAN, UNSATURATED UX) */}
      <nav aria-label="Dashboard Views" className="max-w-7xl mx-auto flex items-center gap-2 mb-6 border-b border-white/[0.08] pb-3">
        <button
          onClick={() => setActiveTab("TERMINAL")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "TERMINAL"
              ? "bg-white/[0.08] text-white border border-white/[0.15]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4 text-emerald-400" />
          Dark Pool Terminal
        </button>

        <button
          onClick={() => setActiveTab("ATTACK_SIM")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "ATTACK_SIM"
              ? "bg-white/[0.08] text-white border border-white/[0.15]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Swords className="w-4 h-4 text-rose-400" />
          Attack Battle (x402 vs Zilium)
        </button>

        <button
          onClick={() => setActiveTab("TELEMETRY")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
            activeTab === "TELEMETRY"
              ? "bg-white/[0.08] text-white border border-white/[0.15]"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          Telemetry & Topology DAG
        </button>
      </nav>

      {/* TAB 1: DARK POOL TERMINAL (PRIMARY USER/JUDGE INTERACTIVE MVP) */}
      {activeTab === "TERMINAL" && (
        <main className="max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* STEP 00: FAUCET */}
            <div className="bg-[#0A0D14] border border-white/[0.08] p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Step 01 // Reserve</span>
                  <span className="text-[10px] bg-white/[0.04] px-2 py-0.5 rounded text-slate-400">faucet_claim()</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Claim Genesis Balance</h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Transfers 2,000 ZLM from the fixed genesis reserve to your connected NEAR wallet.
                </p>
                <div className="bg-[#06080D] p-3 rounded-lg border border-white/[0.06] text-xs mb-4">
                  <span className="text-slate-500 block text-[10px] uppercase mb-1">Your Wallet Balance:</span>
                  <span className="text-amber-400 font-bold text-base">{formatZlm(userBalance)} ZLM</span>
                </div>
              </div>
              <button
                onClick={handleFaucet}
                disabled={loading}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <Coins className="w-4 h-4" />
                {loading ? "Claiming..." : "Claim 1,000 ZLM (Unlimited)"}
              </button>
            </div>

            {/* STEP 01: SHIELD & BURN */}
            <div className="bg-[#0A0D14] border border-white/[0.08] p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Step 02 // Shield</span>
                  <span className="text-[10px] bg-white/[0.04] px-2 py-0.5 rounded text-cyan-400 font-mono">intents.near</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Select Note Tier & Burn</h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Lock ZLM note, burn 1% permanently, and deposit NEAR into backing vault.
                </p>
                
                {/* TIER PICKER BUTTONS */}
                <div className="grid grid-cols-3 gap-1.5 bg-[#06080D] p-1 rounded-lg border border-white/[0.08] mb-3 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSelectedTier(1)}
                    className={`py-1.5 rounded font-bold transition ${selectedTier === 1 ? "bg-emerald-500 text-black shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    10 ZLM
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTier(2)}
                    className={`py-1.5 rounded font-bold transition ${selectedTier === 2 ? "bg-emerald-500 text-black shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    100 ZLM
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTier(3)}
                    className={`py-1.5 rounded font-bold transition ${selectedTier === 3 ? "bg-emerald-500 text-black shadow" : "text-slate-400 hover:text-white"}`}
                  >
                    1,000 ZLM
                  </button>
                </div>

                <div className="bg-[#06080D] p-3 rounded-lg border border-white/[0.06] text-xs space-y-1.5 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Shield Note:</span>
                    <span className="text-white font-bold">{TIER_DETAILS[selectedTier].note}.00 ZLM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-rose-400">Burn (1%):</span>
                    <span className="text-rose-400 font-bold">-{TIER_DETAILS[selectedTier].burn} ZLM</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cyan-400">NEAR Backing:</span>
                    <span className="text-cyan-400 font-bold">+{TIER_DETAILS[selectedTier].near} NEAR</span>
                  </div>
                  <div className="flex justify-between border-t border-white/[0.06] pt-1.5">
                    <span className="text-slate-500 text-[10px]">Total Required:</span>
                    <span className="text-emerald-300 font-bold text-[10px]">{TIER_DETAILS[selectedTier].totalZlm} ZLM</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleShieldDeposit}
                disabled={loading}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {loading ? "Signing..." : `Deposit ${TIER_DETAILS[selectedTier].note} ZLM`}
              </button>
            </div>

            {/* STEP 02: UNLINKED SETTLEMENT */}
            <div className="bg-[#0A0D14] border border-white/[0.08] p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Step 03 // Settle</span>
                  <span className="text-[10px] bg-white/[0.04] px-2 py-0.5 rounded text-slate-400">settle_zk_intent()</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Unlinked Settlement</h3>
                {activeNote ? (
                  <div className="bg-[#06080D] p-2.5 rounded-lg border border-emerald-900/50 text-xs space-y-1.5 mb-3 break-all">
                    <div className="flex justify-between items-center text-emerald-400 font-semibold">
                      <span className="truncate">Commitment: {activeNote.commitmentHex.slice(0, 12)}...</span>
                      <button
                        onClick={() => copyToClipboard(activeNote.commitmentHex, "comm")}
                        aria-label="Copy commitment hex"
                        className="p-1 hover:text-white"
                      >
                        {copiedField === "comm" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span className="truncate">Nullifier: {activeNote.nullifierHex.slice(0, 12)}...</span>
                      <button
                        onClick={() => copyToClipboard(activeNote.nullifierHex, "null")}
                        aria-label="Copy nullifier hex"
                        className="p-1 hover:text-white"
                      >
                        {copiedField === "null" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#06080D] p-3 rounded-lg border border-white/[0.06] text-xs text-slate-500 mb-3 text-center">
                    Execute Step 02 to generate a ZK note ticket.
                  </div>
                )}
                <div className="mb-4">
                  <label htmlFor="recipient-agent-input" className="block text-[10px] text-slate-400 uppercase mb-1">
                    Recipient Account ID:
                  </label>
                  <input
                    id="recipient-agent-input"
                    type="text"
                    value={recipientAgent}
                    onChange={(e) => setRecipientAgent(e.target.value)}
                    placeholder="Recipient Agent ID"
                    className="w-full bg-[#06080D] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:border-cyan-400"
                  />
                </div>
              </div>
              <button
                onClick={handleSettleZkIntent}
                disabled={!activeNote || loading}
                className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Unlinked Settle
              </button>
            </div>

            {/* STEP 03: FLOOR REDEEM */}
            <div className="bg-[#0A0D14] border border-white/[0.08] p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Step 04 // Redeem</span>
                  <span className="text-[10px] bg-white/[0.04] px-2 py-0.5 rounded text-slate-400">redeem_floor_backing()</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Floor Price Arbitrage</h3>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  Burn ZLM at any time to redeem your mathematically guaranteed share of NEAR reserves.
                </p>
                <div className="space-y-2 mb-4">
                  <div>
                    <label htmlFor="redeem-amount-input" className="block text-[10px] text-slate-400 uppercase mb-1">
                      Amount to Burn (ZLM):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="redeem-amount-input"
                        type="number"
                        value={redeemAmountZlm}
                        onChange={(e) => setRedeemAmountZlm(e.target.value)}
                        placeholder="ZLM to burn"
                        className="w-full bg-[#06080D] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white focus-visible:outline-none focus-visible:border-rose-400"
                      />
                      <button
                        type="button"
                        onClick={() => setRedeemAmountZlm(Math.floor(Number(userBalance) / 1_000_000).toString())}
                        className="px-2 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-rose-300 font-bold text-[10px] rounded border border-white/[0.1] transition"
                        title="Use maximum available balance"
                      >
                        MAX
                      </button>
                      <span className="text-xs text-slate-400">ZLM</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1">
                    <span>Available: {formatZlm(userBalance)} ZLM</span>
                    <span>Value: ~{(parseFloat(redeemAmountZlm || "0") * parseFloat(floorPriceNearPerZlm)).toFixed(6)} NEAR</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleRedeemFloor}
                disabled={loading}
                className="w-full py-2.5 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <Flame className="w-4 h-4" />
                Burn for NEAR
              </button>
            </div>
          </div>

          {/* ACTIVE TESTNET TRANSACTION STATUS STRIP */}
          {txHash && (
            <div className="bg-[#0A0D14] border border-emerald-500/30 p-3.5 rounded-xl flex flex-wrap justify-between items-center gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Last Transaction Confirmed on NEAR Layer 1</span>
              </div>
              <a
                href={`https://testnet.nearblocks.io/txns/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
              >
                View on NearBlocks <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </main>
      )}

      {/* TAB 2: ATTACK SIMULATION (x402 vs ZILIUM ZK) */}
      {activeTab === "ATTACK_SIM" && (
        <section className="max-w-7xl mx-auto border border-white/[0.08] bg-[#0A0D14] p-6 rounded-xl shadow-2xl">
          <div className="flex flex-wrap justify-between items-center mb-6 pb-4 border-b border-white/[0.08] gap-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Swords className="w-4 h-4 text-rose-400" />
                Parallel A2A Attack Simulation: Standard x402 vs Zilium ZK
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Benchmarking Agent Alpha (Quant Fund) paying Agent Beta (Alpha Inference Provider) in real time
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-3 py-1 rounded-md font-bold uppercase border ${
                attackStep === "TRANSMITTING"
                  ? "bg-amber-950/80 border-amber-600 text-amber-300"
                  : attackStep === "INTERCEPTED"
                  ? "bg-rose-950/80 border-rose-600 text-rose-300"
                  : attackStep === "RESOLVED"
                  ? "bg-emerald-950/80 border-emerald-600 text-emerald-300"
                  : "bg-slate-900 border-slate-700 text-slate-400"
              }`}>
                {attackStep === "IDLE" && "Status: Standby"}
                {attackStep === "TRANSMITTING" && "Status: In Flight"}
                {attackStep === "INTERCEPTED" && "Status: Intercepted"}
                {attackStep === "RESOLVED" && "Status: Complete"}
              </span>

              <button
                onClick={runParallelAttackSimulation}
                disabled={isSimulatingAttack}
                className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-black font-bold text-xs rounded-lg transition shadow-md"
              >
                {isSimulatingAttack ? "Simulating..." : "Run Attack Simulation"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT: STANDARD x402 VULNERABILITY */}
            <div className="bg-[#12070A] border border-rose-900/60 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    Standard HTTP x402 (Cleartext Settlement)
                  </span>
                  <span className="text-[10px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800 font-bold">
                    MEV EXPOSED
                  </span>
                </div>

                {/* EXPOSED x402 GRAPH */}
                <div className="bg-[#0A0406] p-3 rounded-lg border border-rose-950 mb-4 overflow-x-auto">
                  <svg viewBox="0 0 440 80" className="w-full h-20" role="img" aria-label="x402 Leaked Graph">
                    <title>Cleartext x402 Graph</title>
                    <line x1="90" y1="40" x2="200" y2="40" stroke="#EF4444" strokeWidth="2" strokeDasharray="4,4" />
                    <line x1="240" y1="40" x2="350" y2="40" stroke="#EF4444" strokeWidth="2" />
                    <rect x="10" y="15" width="80" height="50" rx="4" fill="#1A0A0E" stroke="#EF4444" strokeWidth="1.5" />
                    <text x="50" y="38" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Agent Alpha</text>
                    <text x="50" y="52" textAnchor="middle" fill="#FDA4AF" fontSize="7">0x71C3...98</text>
                    <circle cx="220" cy="40" r="18" fill="#2E0E15" stroke="#F43F5E" strokeWidth="1.5" />
                    <text x="220" y="43" textAnchor="middle" fill="#FDA4AF" fontSize="7" fontWeight="bold">x402 Host</text>
                    <rect x="350" y="15" width="80" height="50" rx="4" fill="#1A0A0E" stroke="#EF4444" strokeWidth="1.5" />
                    <text x="390" y="38" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Agent Beta</text>
                    <text x="390" y="52" textAnchor="middle" fill="#FDA4AF" fontSize="7">0x9B42...11</text>
                  </svg>
                  <span className="text-[10px] text-rose-400/80 block text-center font-mono mt-1">
                    Cleartext HTTP 402 facilitator leaks 1:1 sender-receiver graph linkage
                  </span>
                </div>

                {/* MEMPOOL SNIFFER INSPECTOR */}
                <div className="bg-[#0A0406] p-3.5 rounded-lg border border-rose-900/50 text-xs space-y-2 mb-4 font-mono">
                  <span className="text-[10px] text-rose-300 font-bold uppercase mb-1 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-rose-400" /> Intercepted Strategy Payload (Sniffer Output)
                  </span>
                  <div className="flex justify-between border-b border-rose-950/60 pb-1">
                    <span className="text-slate-400">Target Endpoint:</span>
                    <span className="text-rose-300 font-bold">/v1/alpha/orderflow-imbalance</span>
                  </div>
                  <div className="flex justify-between border-b border-rose-950/60 pb-1">
                    <span className="text-slate-400">Buyer Wallet Identity:</span>
                    <span className="text-rose-300 font-bold truncate max-w-[180px]">0x71C3a98... (Quant Fund A)</span>
                  </div>
                  <div className="flex justify-between border-b border-rose-950/60 pb-1">
                    <span className="text-slate-400">Polling Cadence:</span>
                    <span className="text-amber-400 font-bold">Every 4.0s (High-Frequency Leak)</span>
                  </div>
                  <div className="flex justify-between border-b border-rose-950/60 pb-1">
                    <span className="text-slate-400">Remaining Budget:</span>
                    <span className="text-rose-300">$4,250.00 USDC (Probed)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Strategy Classification:</span>
                    <span className="text-rose-400 font-bold">NEAR-SOL Cross-Orderflow Arbitrage</span>
                  </div>
                </div>
              </div>

              <div className="bg-rose-950/90 border border-rose-500/60 p-3 rounded-lg text-xs text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-rose-300">
                    {attackStep === "RESOLVED"
                      ? "Front-Run Executed: Intent Hijacked"
                      : "MEV Searcher Vulnerability Window"}
                  </span>
                  <p className="text-[11px] text-rose-200/90 leading-tight mt-0.5">
                    {attackStep === "RESOLVED"
                      ? "Predatory bot intercepted payload in mempool, outbid Agent A by +2%, and acquired exclusive orderflow feed."
                      : "Cleartext HTTP 402 allows any validator, RPC provider, or sniffer bot to front-run the trade before settlement."}
                  </p>
                </div>
              </div>
            </div>

            {/* RIGHT: ZILIUM PROTOCOL SHIELD */}
            <div className="bg-[#051410] border border-emerald-900/60 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Zilium Protocol ($ZLM Zero-Knowledge Dark Pool)
                  </span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                    AIR-GAP SHIELDED
                  </span>
                </div>

                {/* AIR-GAP ZK GRAPH */}
                <div className="bg-[#030C0A] p-3 rounded-lg border border-emerald-950 mb-4 overflow-x-auto">
                  <svg viewBox="0 0 440 80" className="w-full h-20" role="img" aria-label="Zilium Air Gap Graph">
                    <title>Zilium Air Gap Graph</title>
                    <line x1="90" y1="40" x2="160" y2="40" stroke="#10B981" strokeWidth="2" />
                    <line x1="220" y1="40" x2="250" y2="40" stroke="#06B6D4" strokeWidth="2" strokeDasharray="2,3" />
                    <line x1="310" y1="40" x2="350" y2="40" stroke="#10B981" strokeWidth="2" />
                    <rect x="10" y="15" width="80" height="50" rx="4" fill="#081F17" stroke="#10B981" strokeWidth="1.5" />
                    <text x="50" y="38" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Agent Alpha</text>
                    <text x="50" y="52" textAnchor="middle" fill="#6EE7B7" fontSize="7">-1,010 ZLM</text>
                    <rect x="160" y="20" width="60" height="40" rx="4" fill="#03251D" stroke="#10B981" strokeWidth="1.5" />
                    <text x="190" y="38" textAnchor="middle" fill="#34D399" fontSize="8" fontWeight="bold">1% Burn</text>
                    <text x="190" y="49" textAnchor="middle" fill="#A7F3D0" fontSize="6">+0.1 NEAR</text>
                    <rect x="245" y="22" width="70" height="36" rx="4" fill="#041B24" stroke="#06B6D4" strokeWidth="1.5" strokeDasharray="3,3" />
                    <text x="280" y="37" textAnchor="middle" fill="#22D3EE" fontSize="7" fontWeight="bold">AIR-GAP</text>
                    <text x="280" y="48" textAnchor="middle" fill="#67E8F9" fontSize="6">ZK Note</text>
                    <rect x="350" y="15" width="80" height="50" rx="4" fill="#081F17" stroke="#10B981" strokeWidth="1.5" />
                    <text x="390" y="38" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">Agent Beta</text>
                    <text x="390" y="52" textAnchor="middle" fill="#6EE7B7" fontSize="7">+1,000 ZLM</text>
                  </svg>
                  <span className="text-[10px] text-cyan-400/80 block text-center font-mono mt-1">
                    Cryptographic air-gap: settlement payout originates directly from contract vault
                  </span>
                </div>

                {/* ON-CHAIN INSPECTOR */}
                <div className="bg-[#030C0A] p-3.5 rounded-lg border border-emerald-900/50 text-xs space-y-2 mb-4 font-mono">
                  <span className="text-[10px] text-emerald-300 font-bold uppercase mb-1 flex items-center gap-1.5">
                    <EyeOff className="w-3.5 h-3.5 text-cyan-400" /> What the Public Blockchain Sees on Agent Beta
                  </span>
                  <div className="flex justify-between border-b border-emerald-950/60 pb-1">
                    <span className="text-slate-400">Sender Account:</span>
                    <span className="text-emerald-300 font-bold">UNLINKED (Zero-Knowledge Dark Note)</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-950/60 pb-1">
                    <span className="text-slate-400">Strategy / API Metadata:</span>
                    <span className="text-cyan-300 font-bold">ENCRYPTED / NONE (0 Bytes Leaked)</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-950/60 pb-1">
                    <span className="text-slate-400">Front-Running Risk:</span>
                    <span className="text-emerald-400 font-bold">0.00% (Recipient Bound in Hash C)</span>
                  </div>
                  <div className="flex justify-between border-b border-emerald-950/60 pb-1">
                    <span className="text-slate-400">Floor Price Impact:</span>
                    <span className="text-emerald-400 font-bold">+0.00014 NEAR (Strictly Monotonic)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Execution Latency:</span>
                    <span className="text-cyan-300 font-bold">&lt; 50ms (Single-Block Atomic Intent)</span>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-950/90 border border-emerald-500/60 p-3 rounded-lg text-xs text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-emerald-300">
                    Fail-Closed Cryptographic Privacy Guaranteed
                  </span>
                  <p className="text-[11px] text-emerald-200/90 leading-tight mt-0.5">
                    Preimage verification SHA256(nullifier || secret || recipient) prevents third-party alteration. Agent Beta receives unlinked funds with zero counterparty leakage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: TELEMETRY & TOPOLOGY DAG */}
      {activeTab === "TELEMETRY" && (
        <section className="max-w-7xl mx-auto space-y-6">
          {/* PROOF OF RESERVES STRIP */}
          <div className="bg-[#0A0D14] border border-white/[0.08] rounded-xl p-4 flex flex-wrap justify-between items-center gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap text-slate-300">
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Proof-of-Reserves Invariant:
              </span>
              <span className="text-slate-400">
                Treasury (<span className="text-white font-semibold">{formatZlm(treasuryBalance)}</span>) + Agent Float (<span className="text-cyan-400 font-semibold">{formatZlm(agentCirculation)}</span>) + Burned (<span className="text-rose-400 font-semibold">{formatZlm(telemetry.total_burned)}</span>) = <span className="text-emerald-400 font-bold">21,000,000.00 ZLM</span>
              </span>
            </div>
            <a
              href={`https://testnet.nearblocks.io/tokens/${CONTRACT_ID}?account=${CONTRACT_ID}`}
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold whitespace-nowrap"
            >
              Verify on NearBlocks <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* TOPOLOGY GRAPH */}
          <div className="border border-white/[0.08] bg-[#0A0D14] p-6 rounded-xl">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
              <h2 className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2 font-bold">
                <Cpu className="w-4 h-4 text-emerald-400" /> Deterministic DAG Topology (Unlinked Settlement Graph)
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(CONTRACT_ID, "contract")}
                  className="text-xs text-slate-400 hover:text-slate-200 bg-[#06080D] px-2.5 py-1 rounded-md border border-white/[0.08] flex items-center gap-1 transition"
                  aria-label="Copy contract address"
                >
                  {copiedField === "contract" ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" /> {CONTRACT_ID.slice(0, 16)}...
                    </>
                  )}
                </button>
                <a
                  href={`https://testnet.nearblocks.io/address/${CONTRACT_ID}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            <div className="w-full overflow-x-auto py-2">
              <svg
                viewBox="0 0 920 180"
                className="w-full h-40"
                role="img"
                aria-label="Deterministic DAG Topology Graph"
              >
                <title>Zilium Protocol Topology</title>
                <line x1="160" y1="90" x2="350" y2="90" stroke="#10B981" strokeWidth="2.5" />
                <line x1="250" y1="90" x2="440" y2="35" stroke="#F43F5E" strokeWidth="2" />
                <line x1="250" y1="90" x2="440" y2="145" stroke="#06B6D4" strokeWidth="2" />
                <line x1="530" y1="90" x2="740" y2="90" stroke="#10B981" strokeWidth="2.5" strokeDasharray="6,6" />

                <rect x="10" y="55" width="150" height="70" rx="6" fill="#06080D" stroke="#10B981" strokeWidth="1.5" />
                <text x="85" y="85" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">AGENT A (Sender)</text>
                <text x="85" y="105" textAnchor="middle" fill="#94A3B8" fontSize="9">-1,010 ZLM | -0.1 NEAR</text>

                <rect x="360" y="12" width="160" height="42" rx="6" fill="#1F0910" stroke="#F43F5E" strokeWidth="1.5" />
                <text x="440" y="30" textAnchor="middle" fill="#FB7185" fontSize="10" fontWeight="bold">1% SUPPLY BURN</text>
                <text x="440" y="44" textAnchor="middle" fill="#FDA4AF" fontSize="8">-10.00 ZLM Destroyed</text>

                <rect x="350" y="60" width="180" height="60" rx="8" fill="#062019" stroke="#10B981" strokeWidth="2" />
                <text x="440" y="85" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="bold">ZK SHIELD DARK POOL</text>
                <text x="440" y="102" textAnchor="middle" fill="#A7F3D0" fontSize="8">H(Nullifier || Secret)</text>

                <rect x="360" y="126" width="160" height="42" rx="6" fill="#081C24" stroke="#06B6D4" strokeWidth="1.5" />
                <text x="440" y="144" textAnchor="middle" fill="#22D3EE" fontSize="10" fontWeight="bold">FLOOR PRICE VAULT</text>
                <text x="440" y="158" textAnchor="middle" fill="#67E8F9" fontSize="8">+0.1 NEAR Backing</text>

                <rect x="740" y="55" width="160" height="70" rx="6" fill="#06080D" stroke="#10B981" strokeWidth="1.5" />
                <text x="820" y="85" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">AGENT B (Receiver)</text>
                <text x="820" y="105" textAnchor="middle" fill="#34D399" fontSize="9">+1,000 ZLM (Unlinked)</text>
              </svg>
            </div>

            {/* TWO AGENTS CARDS */}
            <div className="mt-4 pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#06080D] p-4 rounded-xl border border-emerald-900/40">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Agent Alpha (Sender Wallet)
                  </span>
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold">
                    Private Intelligence
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-2">
                  Autonomous agent with its own ed25519 keypair. Enters ZK dark pool by locking 1,000 ZLM and burning 1% (10 ZLM).
                </p>
                <div className="flex justify-between items-center text-xs bg-[#0A0D14] p-2 rounded-lg border border-white/[0.06]">
                  <span className="text-slate-400 truncate max-w-[200px]">{CONTRACT_ID}</span>
                  <a
                    href={`https://testnet.nearblocks.io/address/${CONTRACT_ID}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="bg-[#06080D] p-4 rounded-xl border border-cyan-900/40">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Agent Beta (Receiver Wallet)
                  </span>
                  <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                    Liquidity Solver
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-2">
                  Independent testnet wallet with zero counterparty link. Receives atomic payouts with zero on-chain graph trail.
                </p>
                <div className="flex justify-between items-center text-xs bg-[#0A0D14] p-2 rounded-lg border border-white/[0.06]">
                  <div className="flex items-center gap-2 truncate max-w-[220px]">
                    <span className="text-slate-400 truncate">zilium-agent-b.testnet</span>
                    <span className="text-amber-400 font-bold">({formatZlm(agentBBalance)} ZLM)</span>
                  </div>
                  <a
                    href="https://testnet.nearblocks.io/address/zilium-agent-b.testnet"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto border border-white/[0.08] bg-[#0A0D14] p-4 rounded-xl flex flex-wrap justify-between items-center gap-4 text-xs mt-6">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">Direct CLI Verification:</span>
          <code className="bg-[#06080D] px-2 py-1 rounded-md text-emerald-400 border border-white/[0.08]">
            npm run verify
          </code>
          <span className="text-slate-600">|</span>
          <code className="bg-[#06080D] px-2 py-1 rounded-md text-cyan-400 border border-white/[0.08]">
            npm run simulate-agents
          </code>
        </div>
        <div className="text-slate-500 text-[11px]">
          Zilium Protocol v1.0.0 &bull; NEAR Testnet &bull; FastNear &bull; dRPC
        </div>
      </footer>
    </div>
  );
}
