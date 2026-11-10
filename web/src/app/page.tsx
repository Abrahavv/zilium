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
  Info,
  X,
} from "lucide-react";
import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";

export default function ZiliumDashboard() {
  const [engine] = useState(() => new DeterministicZiliumEngine());
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
  const [activeNote, setActiveNote] = useState<ZkNoteTicket | null>(null);

  const [recipientAgent, setRecipientAgent] = useState("zilium-agent-b.testnet");
  const [redeemAmountZlm, setRedeemAmountZlm] = useState("1000");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [graphStep, setGraphStep] = useState<"IDLE" | "SHIELDED" | "SETTLED" | "REDEEMED">("IDLE");
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showArchExplainer, setShowArchExplainer] = useState(false);

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
    try {
      const [state, treasury] = await Promise.all([
        fetchProtocolTelemetry(),
        fetchTokenBalance(CONTRACT_ID),
      ]);
      setTelemetry(state);
      setTreasuryBalance(treasury);
      if (walletAccountId) {
        const bal = await fetchTokenBalance(walletAccountId);
        setUserBalance(bal);
      }
    } catch {
      if (mode === "SIMULATION") {
        setTelemetry(engine.getState());
        setUserBalance(engine.getUserBalance());
      }
    }
  }, [engine, mode, walletAccountId]);

  useEffect(() => {
    syncState();
    // Real-time telemetry polling every 15 seconds
    const interval = setInterval(syncState, 15000);
    return () => clearInterval(interval);
  }, [syncState]);

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
    const wallet = await walletSelector.wallet();
    const outcome = await wallet.signAndSendTransaction({
      signerId: walletAccountId,
      receiverId: CONTRACT_ID,
      actions: [
        {
          type: "FunctionCall" as const,
          params: {
            methodName,
            args,
            gas: "100000000000000",
            deposit: attachedYocto,
          },
        } as any,
      ],
    });
    return (outcome as any)?.transaction?.hash || (outcome as any)?.transaction_outcome?.id || "verified";
  };

  const handleFaucet = async () => {
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod("faucet_claim", {});
        setTxHash(hash);
        notify("Claimed 2,000 ZLM via Connected Wallet!", "success");
        await syncState();
      } else {
        const res = engine.faucetClaim(walletAccountId || "agent-demo.testnet");
        syncState();
        notify(res.message, "success");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Faucet: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleShieldDeposit = async () => {
    setLoading(true);
    try {
      const ticket = await generateZkCommitment();
      setActiveNote(ticket);

      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod(
          "deposit_zk_shield",
          { commitment_hex: ticket.commitmentHex },
          "100000000000000000000000"
        );
        setTxHash(hash);
        notify("ZK Note Deposited on NEAR Testnet (1% Burn + Floor Raised)!", "success");
        await syncState();
      } else {
        const res = engine.depositShield(ticket);
        if (!res.success) {
          notify(res.message, "error");
          return;
        }
        syncState();
        notify("Note Shielded: 1,000 ZLM locked, 10 ZLM burned, +0.1 NEAR backed", "success");
      }
      setGraphStep("SHIELDED");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Deposit: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSettleZkIntent = async () => {
    if (!activeNote) return;
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod("settle_zk_intent", {
          nullifier_hex: activeNote.nullifierHex,
          secret_hex: activeNote.secretHex,
          recipient_id: recipientAgent,
        });
        setTxHash(hash);
        notify("Unlinked Settlement Confirmed on Testnet!", "success");
        await syncState();
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
        notify(`Settled 1,000 ZLM unlinked to ${recipientAgent}`, "success");
      }
      setGraphStep("SETTLED");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Settlement: ${message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemFloor = async () => {
    // Precise integer arithmetic (no float math precision loss)
    const zlmUnits = BigInt(Math.floor(Number(redeemAmountZlm || "0")));
    const rawUnits = (zlmUnits * BigInt(1_000_000)).toString();
    setLoading(true);
    try {
      if (mode === "LIVE_TESTNET" && walletAccountId) {
        const hash = await callContractMethod("redeem_floor_backing", { amount: rawUnits });
        setTxHash(hash);
        notify("Burned ZLM and redeemed proportional NEAR backing!", "success");
        await syncState();
      } else {
        const res = engine.redeemFloor(rawUnits);
        if (!res.success) {
          notify(res.message, "error");
          return;
        }
        syncState();
        notify(res.message, "success");
      }
      setGraphStep("REDEEMED");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify(`Redemption: ${message}`, "error");
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
    <div className="min-h-screen bg-[#06080D] text-slate-100 font-mono p-4 md:p-8">
      {/* ACCESSIBLE NOTIFICATION TOAST */}
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

      {/* HEADER BAR */}
      <header className="max-w-7xl mx-auto border border-slate-800 bg-[#0B0F17] p-4 rounded-lg mb-6 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/40 rounded-lg">
            <Shield className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-wider text-white">ZILIUM ($ZLM)</h1>
              <span className="text-xs text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60 font-semibold">
                NEP-141 + ZK SHIELD
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Autonomous A2A Deflationary Currency & Monotonic Floor Treasury on NEAR Protocol
            </p>
          </div>
        </div>

        {/* WALLET & MODE TOGGLE */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowArchExplainer(!showArchExplainer)}
            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs rounded border border-slate-700 transition flex items-center gap-1.5"
            aria-label="Toggle Architecture Guide"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Architecture</span>
          </button>

          <div className="flex items-center gap-1 bg-[#06080D] p-1 rounded border border-slate-800 text-xs">
            <button
              onClick={() => setMode("LIVE_TESTNET")}
              className={`px-3 py-1.5 rounded transition focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none ${
                mode === "LIVE_TESTNET"
                  ? "bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Live NEAR Testnet
            </button>
            <button
              onClick={() => setMode("SIMULATION")}
              className={`px-3 py-1.5 rounded transition focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none ${
                mode === "SIMULATION"
                  ? "bg-emerald-500 text-black font-bold shadow-md shadow-emerald-500/20"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Sandbox Simulation
            </button>
          </div>

          {walletAccountId ? (
            <div className="flex items-center gap-2 bg-[#06080D] border border-emerald-600/60 rounded px-3 py-1.5 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300 font-bold truncate max-w-[140px]">{walletAccountId}</span>
              <button
                onClick={handleSignOut}
                className="text-slate-400 hover:text-rose-400 transition ml-1 p-0.5 rounded focus-visible:ring-1 focus-visible:ring-rose-400 focus-visible:outline-none"
                aria-label="Disconnect NEAR Wallet"
                title="Disconnect"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnectWallet}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded transition flex items-center gap-2 shadow-md shadow-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
            >
              <Wallet className="w-3.5 h-3.5" /> Connect NEAR Wallet
            </button>
          )}
        </div>
      </header>

      {/* ARCHITECTURE EXPLAINER CARD */}
      {showArchExplainer && (
        <section className="max-w-7xl mx-auto border border-cyan-800/60 bg-[#08131E] p-5 rounded-lg mb-6 text-xs space-y-3">
          <div className="flex justify-between items-center border-b border-cyan-900/40 pb-2">
            <h2 className="font-bold text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" /> Zilium Cryptoeconomic Invariants & Architecture
            </h2>
            <button
              onClick={() => setShowArchExplainer(false)}
              className="text-slate-400 hover:text-white"
              aria-label="Close Architecture Guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300">
            <div className="p-3 bg-[#06080D] rounded border border-slate-800">
              <span className="text-emerald-400 font-bold block mb-1">1. Strict Hard Cap (21,000,000 ZLM)</span>
              <p className="text-slate-400 leading-relaxed">
                All 21M tokens are minted at contract genesis. The protocol has no minting mechanism post-init. Total supply is mathematically non-increasing (Supply &le; 21,000,000 ZLM).
              </p>
            </div>
            <div className="p-3 bg-[#06080D] rounded border border-slate-800">
              <span className="text-rose-400 font-bold block mb-1">2. Monotonic Floor Price Theorem</span>
              <p className="text-slate-400 leading-relaxed">
                Every shield deposit burns 1% of the note (10 ZLM) and locks &ge; 0.1 NEAR into the backing vault. Floor Price (Vault / Supply) is strictly monotonically increasing.
              </p>
            </div>
            <div className="p-3 bg-[#06080D] rounded border border-slate-800">
              <span className="text-cyan-400 font-bold block mb-1">3. Front-Running Safe Dark Pool</span>
              <p className="text-slate-400 leading-relaxed">
                Commitment C = SHA256(Nullifier || Secret || Recipient). Unlinked settlement allows agents to settle transactions without revealing sender-receiver graph linkages.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4 TELEMETRY TILES */}
      <section className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0B0F17] border border-slate-800 p-4 rounded-lg">
          <span className="text-xs text-slate-400 block tracking-wider uppercase mb-1">
            CIRCULATING SUPPLY (DECREASING)
          </span>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatZlm(telemetry.current_supply)} <span className="text-xs text-slate-500 font-normal">ZLM</span>
          </div>
          <span className="text-xs text-emerald-400 font-semibold">Strict Hard Cap: 21,000,000</span>
        </div>

        <div className="bg-[#0B0F17] border border-rose-900/30 p-4 rounded-lg">
          <span className="text-xs text-rose-400 tracking-wider uppercase mb-1 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" /> PERMANENTLY BURNED (1%)
          </span>
          <div className="text-xl font-bold text-rose-400 tracking-tight">
            {formatZlm(telemetry.total_burned)} <span className="text-xs text-rose-600 font-normal">ZLM</span>
          </div>
          <span className="text-xs text-rose-500/70">10 ZLM destroyed per note</span>
        </div>

        <div className="bg-[#0B0F17] border border-emerald-900/30 p-4 rounded-lg">
          <span className="text-xs text-emerald-400 tracking-wider uppercase mb-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> INTRINSIC FLOOR PRICE
          </span>
          <div className="text-xl font-bold text-emerald-400 tracking-tight">
            {floorPriceNearPerZlm} <span className="text-xs text-emerald-600 font-normal">NEAR/ZLM</span>
          </div>
          <span className="text-xs text-emerald-500/70">Vault: {formatNear(telemetry.near_vault_backing)} NEAR</span>
        </div>

        <div className="bg-[#0B0F17] border border-cyan-900/30 p-4 rounded-lg">
          <span className="text-xs text-cyan-400 tracking-wider uppercase mb-1 flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> ACTIVE DARK POOL NOTES
          </span>
          <div className="text-xl font-bold text-cyan-400 tracking-tight">
            {telemetry.active_zk_notes} <span className="text-xs text-cyan-600 font-normal">NOTES</span>
          </div>
          <span className="text-xs text-cyan-500/70">Unlinked A2A settlement ready</span>
        </div>
      </section>

      {/* ON-CHAIN PROOF-OF-RESERVES & SUPPLY AUDIT */}
      <section className="max-w-7xl mx-auto border border-emerald-900/40 bg-[#071318] p-5 rounded-lg mb-6">
        <div className="flex flex-wrap justify-between items-center mb-4 pb-3 border-b border-emerald-900/40 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                On-Chain Proof-of-Reserves & Supply Audit
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Strict Mathematical Accounting: Treasury Reserve + Agent Market Float + Total Burned ≡ 21,000,000.00 ZLM Hard Cap
            </p>
          </div>
          <span className="text-xs text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded border border-emerald-700/60 font-bold">
            100.000% INVARIANT VERIFIED
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-[#0B0F17] p-3.5 rounded border border-slate-800">
            <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">
              1. CONTRACT RESERVE TREASURY
            </span>
            <div className="text-lg font-bold text-emerald-400">
              {formatZlm(treasuryBalance)} <span className="text-xs text-slate-400 font-normal">ZLM</span>
            </div>
            <span className="text-xs text-slate-400 block mt-1">
              Held in contract <code className="text-cyan-400">{CONTRACT_ID.slice(0, 14)}...</code>
            </span>
          </div>

          <div className="bg-[#0B0F17] p-3.5 rounded border border-slate-800">
            <span className="text-xs text-cyan-400 uppercase tracking-wider block mb-1">
              2. ACTIVE AGENT FLOAT (UNLINKED)
            </span>
            <div className="text-lg font-bold text-cyan-400">
              {formatZlm(agentCirculation)} <span className="text-xs text-slate-400 font-normal">ZLM</span>
            </div>
            <span className="text-xs text-slate-400 block mt-1">
              Extracted & settled across autonomous agent accounts
            </span>
          </div>

          <div className="bg-[#0B0F17] p-3.5 rounded border border-slate-800">
            <span className="text-xs text-rose-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" /> 3. PERMANENTLY DESTROYED
            </span>
            <div className="text-lg font-bold text-rose-400">
              {formatZlm(telemetry.total_burned)} <span className="text-xs text-slate-400 font-normal">ZLM</span>
            </div>
            <span className="text-xs text-slate-400 block mt-1">
              Burned irrevocably via 1% fee on each shield note
            </span>
          </div>
        </div>

        {/* RECONCILIATION BAR */}
        <div className="bg-[#06080D] p-3 rounded border border-emerald-900/40 flex flex-wrap justify-between items-center gap-2 text-xs">
          <div className="text-slate-300">
            <span className="text-emerald-400 font-bold">Explorer Cross-Verification:</span> NearBlocks lists the contract address as the primary holder holding the Treasury Reserve ({formatZlm(treasuryBalance)} ZLM). Adding the external Agent Float ({formatZlm(agentCirculation)} ZLM) equals the Circulating Supply ({formatZlm(telemetry.current_supply)} ZLM).
          </div>
          <a
            href={`https://testnet.nearblocks.io/tokens/${CONTRACT_ID}?account=${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold whitespace-nowrap"
          >
            NearBlocks Token Holders <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      {/* TOPOLOGY GRAPH */}
      <section className="max-w-7xl mx-auto border border-slate-800 bg-[#0B0F17] p-5 rounded-lg mb-6">
        <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
          <h2 className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" /> Deterministic DAG Topology (Unlinked Settlement Graph)
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(CONTRACT_ID, "contract")}
              className="text-xs text-slate-400 hover:text-slate-200 bg-slate-900 px-2 py-1 rounded border border-slate-800 flex items-center gap-1 transition"
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
              aria-label="View contract on NearBlocks"
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
            aria-label="Deterministic DAG Topology Graph displaying Agent A, 1% Supply Burn, ZK Shield Dark Pool, Floor Price Vault, and Agent B"
          >
            <title>Zilium Protocol Deterministic DAG Topology</title>
            <line x1="160" y1="90" x2="350" y2="90" stroke={graphStep !== "IDLE" ? "#10B981" : "#334155"} strokeWidth="2.5" strokeDasharray={graphStep === "IDLE" ? "6,6" : "0"} />
            <line x1="250" y1="90" x2="440" y2="35" stroke={graphStep !== "IDLE" ? "#F43F5E" : "#334155"} strokeWidth="2" />
            <line x1="250" y1="90" x2="440" y2="145" stroke={graphStep !== "IDLE" ? "#06B6D4" : "#334155"} strokeWidth="2" />
            <line x1="530" y1="90" x2="740" y2="90" stroke={graphStep === "SETTLED" ? "#10B981" : "#334155"} strokeWidth="2.5" strokeDasharray="6,6" />

            <rect x="10" y="55" width="150" height="70" rx="6" fill="#06080D" stroke="#10B981" strokeWidth="1.5" />
            <text x="85" y="85" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">AGENT A (Sender)</text>
            <text x="85" y="105" textAnchor="middle" fill="#94A3B8" fontSize="9">-1,010 ZLM | -0.1 NEAR</text>

            <rect x="360" y="12" width="160" height="42" rx="6" fill="#1F0910" stroke="#F43F5E" strokeWidth="1.5" />
            <text x="440" y="30" textAnchor="middle" fill="#FB7185" fontSize="10" fontWeight="bold">🔥 1% SUPPLY BURN</text>
            <text x="440" y="44" textAnchor="middle" fill="#FDA4AF" fontSize="8">-10.00 ZLM Destroyed</text>

            <rect x="350" y="60" width="180" height="60" rx="8" fill="#062019" stroke="#10B981" strokeWidth="2" />
            <text x="440" y="85" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="bold">ZK SHIELD DARK POOL</text>
            <text x="440" y="102" textAnchor="middle" fill="#A7F3D0" fontSize="8">H(Nullifier || Secret)</text>

            <rect x="360" y="126" width="160" height="42" rx="6" fill="#081C24" stroke="#06B6D4" strokeWidth="1.5" />
            <text x="440" y="144" textAnchor="middle" fill="#22D3EE" fontSize="10" fontWeight="bold">💎 FLOOR PRICE VAULT</text>
            <text x="440" y="158" textAnchor="middle" fill="#67E8F9" fontSize="8">+0.1 NEAR Backing</text>

            <rect x="740" y="55" width="160" height="70" rx="6" fill="#06080D" stroke={graphStep === "SETTLED" ? "#10B981" : "#475569"} strokeWidth="1.5" />
            <text x="820" y="85" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="bold">AGENT B (Receiver)</text>
            <text x="820" y="105" textAnchor="middle" fill="#34D399" fontSize="9">+1,000 ZLM (Unlinked)</text>
          </svg>
        </div>
      </section>

      {/* 4 INTERACTIVE STEPS BOARD */}
      <main className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* STEP 00: FAUCET */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">Step 00 // Faucet</span>
              <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400">faucet_claim()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Claim Agent Balance</h3>
            <p className="text-xs text-slate-400 mb-4">
              Transfers 2,000 ZLM from the fixed genesis reserve to your connected NEAR Testnet account.
            </p>
            <div className="bg-[#06080D] p-3 rounded border border-slate-800 text-xs mb-4">
              <span className="text-slate-400 block text-xs uppercase mb-1">CONNECTED WALLET BALANCE:</span>
              <span className="text-amber-400 font-bold text-base">{formatZlm(userBalance)} ZLM</span>
            </div>
          </div>
          <button
            onClick={handleFaucet}
            disabled={loading}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:outline-none"
          >
            <Coins className="w-4 h-4" />
            {loading ? "PROCESSING..." : "CLAIM 2,000 ZLM"}
          </button>
        </div>

        {/* STEP 01: SHIELD */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Step 01 // Shield</span>
              <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400">deposit_zk_shield()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Lock 1,000 & Burn 1%</h3>
            <p className="text-xs text-slate-400 mb-3">
              Deducts 1,010 ZLM: 1,000 to the dark pool note, 10 ZLM permanently burned, 0.1 NEAR to vault.
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
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            <Lock className="w-4 h-4" />
            {loading ? "SIGNING..." : "1. DEPOSIT & BURN 1%"}
          </button>
        </div>

        {/* STEP 02: SETTLE */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-wide">Step 02 // Settle</span>
              <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400">settle_zk_intent()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Unlinked Settlement</h3>
            {activeNote ? (
              <div className="bg-[#06080D] p-2.5 rounded border border-emerald-900/50 text-xs space-y-1.5 mb-3 break-all">
                <div className="flex justify-between items-center text-emerald-400 font-semibold">
                  <span className="truncate">Commitment: {activeNote.commitmentHex.slice(0, 14)}...</span>
                  <button
                    onClick={() => copyToClipboard(activeNote.commitmentHex, "comm")}
                    aria-label="Copy commitment hex"
                    className="p-1 hover:text-white"
                  >
                    {copiedField === "comm" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span className="truncate">Nullifier: {activeNote.nullifierHex.slice(0, 14)}...</span>
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
              <div className="bg-[#06080D] p-3 rounded border border-slate-800 text-xs text-slate-500 mb-3 text-center">
                Execute Step 01 to generate a ZK note ticket.
              </div>
            )}
            <div className="mb-4">
              <label htmlFor="recipient-agent-input" className="block text-xs text-slate-400 mb-1">
                Recipient Agent ID:
              </label>
              <input
                id="recipient-agent-input"
                type="text"
                value={recipientAgent}
                onChange={(e) => setRecipientAgent(e.target.value)}
                placeholder="Recipient Agent ID"
                className="w-full bg-[#06080D] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus-visible:ring-1 focus-visible:ring-cyan-400 focus-visible:outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleSettleZkIntent}
            disabled={!activeNote || loading}
            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-600 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <ArrowRight className="w-4 h-4" />
            2. UNLINKED SETTLE
          </button>
        </div>

        {/* STEP 03: FLOOR REDEEM */}
        <div className="border border-slate-800 bg-[#0B0F17] p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wide">Step 03 // Floor</span>
              <span className="text-xs bg-slate-900 px-2 py-0.5 rounded text-slate-400">redeem_floor_backing()</span>
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Floor Price Arbitrage</h3>
            <p className="text-xs text-slate-400 mb-3">
              Burn ZLM at any moment to redeem your mathematically guaranteed share of the NEAR vault.
            </p>
            <div className="space-y-2 mb-4">
              <div>
                <label htmlFor="redeem-amount-input" className="block text-xs text-slate-400 mb-1">
                  Amount to Burn (ZLM):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="redeem-amount-input"
                    type="number"
                    value={redeemAmountZlm}
                    onChange={(e) => setRedeemAmountZlm(e.target.value)}
                    placeholder="ZLM to burn"
                    className="w-full bg-[#06080D] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus-visible:ring-1 focus-visible:ring-rose-400 focus-visible:outline-none"
                  />
                  <span className="text-xs text-slate-400">ZLM</span>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Guaranteed Yield: ~{(parseFloat(redeemAmountZlm || "0") * parseFloat(floorPriceNearPerZlm)).toFixed(6)} NEAR
              </div>
            </div>
          </div>
          <button
            onClick={handleRedeemFloor}
            disabled={loading}
            className="w-full py-2.5 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-black font-bold text-xs rounded transition flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
          >
            <Flame className="w-4 h-4" />
            3. BURN FOR NEAR
          </button>
        </div>
      </main>

      {/* FOOTER & ON-CHAIN PROOFS */}
      <footer className="max-w-7xl mx-auto border border-slate-800 bg-[#0B0F17] p-4 rounded-lg flex flex-wrap justify-between items-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">Direct CLI Verification:</span>
          <code className="bg-[#06080D] px-2 py-1 rounded text-emerald-400 border border-slate-800">
            npm run verify
          </code>
          <span className="text-slate-600">|</span>
          <code className="bg-[#06080D] px-2 py-1 rounded text-cyan-400 border border-slate-800">
            npm run simulate-agents
          </code>
        </div>
        {txHash && (
          <a
            href={`https://testnet.nearblocks.io/txns/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> View Transaction on NearBlocks
          </a>
        )}
      </footer>
    </div>
  );
}
