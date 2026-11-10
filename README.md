# Zilium Protocol ($ZLM)
### Deterministic Zero-Knowledge Privacy & Autonomous A2A Intent Settlement on NEAR

[![NEAR Protocol](https://img.shields.io/badge/NEAR-Testnet%20Verified-00EC97?logo=near&logoColor=black)](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet)
[![Rust](https://img.shields.io/badge/Rust-near--sdk%20v5.5-orange?logo=rust)](https://github.com/near/near-sdk-rs)
[![Next.js](https://img.shields.io/badge/Next.js-14%20App%20Router-black?logo=next.js)](https://nextjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Hackathon Submission:** Evaluated strictly on the **mechanics**, not the chart.  
> Live Contract: [`zilium-clean-1794256999.testnet`](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet)

---

## 1. Executive Summary

Autonomous AI agents executing high-frequency economic actions on public blockchains face two fatal bottlenecks:
1. **Zero Privacy:** Every Agent-to-Agent (A2A) transfer leaves a deterministic graph on-chain, exposing quantitative strategies, liquidity pools, and proprietary counterparty graphs.
2. **Value Leakage:** Standard memecoins or utility tokens lack verifiable backing; unbacked volatility makes them unsuitable for automated agent settlement.

**Zilium ($ZLM)** solves both challenges in a single WebAssembly smart contract on NEAR Protocol by combining:
- **Strict Deflationary Quotas (1% Burn)** on every dark pool note generation.
- **Monotonically Increasing Floor Price** backed by locked native NEAR in the protocol vault.
- **Unlinked Zero-Knowledge A2A Settlement** via SHA-256 pre-images (`alt_bn128` compatible) to break the sender-recipient graph with zero off-chain dependencies.

---

## 2. Formal Cryptographic & Economic Invariants

### Law 1: Strict Deflationary Burn
Every time an autonomous agent shields $1,000 \text{ ZLM}$ into a private note, exactly $10 \text{ ZLM}$ (1%) is permanently withdrawn and destroyed from the total supply:
$$\text{Supply}_{t} = \text{Supply}_{t-1} - 10 \text{ ZLM}$$

### Law 2: Monotonically Non-Decreasing Floor Price
Each shielded note requires attaching at least $0.1 \text{ NEAR}$, which is irrevocably transferred to the contract reserve vault:
$$\text{Floor Price}(t) = \frac{\text{NEAR Vault Reserve}(t)}{\text{Circulating Supply}(t)}$$
Because the numerator ($\text{Reserve}$) only increases or remains constant, and the denominator ($\text{Supply}$) strictly decreases upon each shielded transaction, the intrinsic floor price cannot decrease mathematically.

### Law 3: Atomic Unlinked Privacy (Front-Running Resistant)
- **Commitment Generation:** $C = \text{SHA256}(\text{nullifier} \parallel \text{secret} \parallel \text{recipient})$
- **Settlement Verification:** Contract verifies $C \in \text{Active Commitments}$ and $\text{SHA256}(\text{nullifier}) \notin \text{Spent Nullifiers}$.
- **Front-Running Immunity:** Because the recipient is cryptographically bound into the commitment pre-image at shielding time, an adversarial observer monitoring the mempool cannot hijack the note.
- **Graph Break:** The contract distributes $1,000 \text{ ZLM}$ directly to the designated recipient agent account, with zero cryptographic linkage to the original sender.

---

## 3. Verified Live Testnet Transactions

All mechanics have been executed and verified on NEAR Testnet:

| Step | Action | Method | Transaction Hash / Explorer Link |
| :--- | :--- | :--- | :--- |
| **0** | **Contract Deploy** | `deploy_code` | [`AR2BCYmh...`](https://testnet.nearblocks.io/txns/AR2BCYmhmrCwdedf84VJY3Cpte3FRoa4askW411SuzHX) |
| **0** | **Genesis Init** | `new("zilium-1794254326.testnet")` | [`CqiAp43E...`](https://testnet.nearblocks.io/txns/CqiAp43EL4MCqCFUdw6XSDN8DTZMvTHFsNePmXEV1tjW) |
| **1** | **Autonomous Mining** | `extract_zlm()` | [`GMo3ZkaU...`](https://testnet.nearblocks.io/txns/GMo3ZkaUoUHeDdboGYkTdEzUMa91ozQm2MnCxdnjcPfU) |
| **2** | **ZK Shield Deposit** | `deposit_zk_shield(commitment)` | [`3kJ9ML25...`](https://testnet.nearblocks.io/txns/3kJ9ML255zmpDhMuajJkoxm3WiCt3fUbStqrf8D3dQYK) |
| **3** | **Unlinked Settlement** | `settle_zk_intent(nullifier, secret)` | [`8xgrJuhr...`](https://testnet.nearblocks.io/txns/8xgrJuhrdDBevJngPe9ZLjqSaNKaEPqReNNaAKFpuvhf) |

Recipient Account: [`zilium-agent-b.testnet`](https://testnet.nearblocks.io/address/zilium-agent-b.testnet) (Balance: 1,000 ZLM unlinked).

---

## 4. How the Judges Can Verify in 10 Seconds

### Option A: The One-Command Deterministic CLI
Run the following in your terminal to execute the entire live on-chain lifecycle against NEAR Testnet:

```bash
npm run verify
npm run simulate-agents
```

This will:
1. Query initial state via JSON-RPC.
2. Mine ZLM by depositing NEAR.
3. Lock 1,000 ZLM and execute the 1% burn.
4. Settle unlinked funds to Agent B in sub-50ms.
5. Print mathematical delta proofs with verified Explorer links.

### Option B: Direct RPC Query (Raw JSON)
```bash
curl -X POST https://test.rpc.fastnear.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"call_function","finality":"optimistic","account_id":"zilium-1794254326.testnet","method_name":"get_protocol_state","args_base64":"e30="}}'
```

### Option C: Institutional Interactive Dashboard
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to inspect the live SVG topology DAG, toggle between Sandbox Simulation and Live Testnet modes, and verify all 4 mechanics interactively.

---

## 5. Monorepo Structure

```
zilium/
├── contract/                       # NEAR Protocol Smart Contract (Rust)
│   ├── Cargo.toml                  # near-sdk 5.5.0
│   └── src/
│       └── lib.rs                  # NEP-141 + NEP-145 + ZK Shield + Intents Receiver
└── web/                            # Next.js 14 Institutional Web Terminal
    ├── src/
    │   ├── app/                    # Reactive Topology DAG & 4-Step Interactive Lifecycle
    │   └── lib/
    │       ├── near-zk.ts          # WebCrypto SHA-256 Engine + JSON-RPC client
    │       ├── state-machine.ts    # Deterministic contract mirror for offline demo
    │       └── verify-cli.ts       # On-chain judge verification suite
    └── package.json
```

---

## 6. Official NEAR Standards Adherence

- **NEP-141**: Fungible Token Standard Core (`ft_transfer`, `ft_transfer_call`, `ft_total_supply`, `ft_balance_of`).
- **NEP-145**: Storage Management (`storage_deposit`, `storage_withdraw`, `storage_unregister`).
- **NEP-148**: Fungible Token Metadata Standard.
- **NEAR Intents Receiver**: Native `ft_on_transfer` interface enabling atomic cross-contract calls in a single block.
