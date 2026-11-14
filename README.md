# Zilium Protocol ($ZLM) - Deterministic Zero-Knowledge Privacy & Autonomous A2A Intent Settlement on NEAR


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
- **Strict Deflationary Quotas (1% Burn)** on every dark pool note generation, permanently decreasing total supply.
- **Monotonically Increasing Floor Price** backed by locked native NEAR in the protocol vault.
- **True On-Chain Groth16 BN254 ZK-SNARKs (`env::alt_bn128_pairing_check`):** Commitments are generated over Poseidon (`circomlib`) and settled via `settle_zk_snark` using NEAR's native `alt_bn128_g1_multiexp` and `alt_bn128_pairing_check` host functions—never exposing `nullifier` or `secret` pre-images on-chain.
- **Native NEP-366 Relayer & Live HTTP `402` (x402) Endpoint:** Real `/api/x402-inference` server returning `402 Payment Required` challenges and settling via Zilium Groth16 proofs before returning AI orderflow alpha.

---

## 2. Formal Cryptographic & Economic Invariants

### Law 1: Strict Deflationary Shielding Quota (1% Burn)
Every time an autonomous agent shields `ZLM` into a private note to rebalance liquidity or execute an OTC settlement, a strict **1% burn fee** is permanently deducted from total circulating supply:

$$\text{Supply}_{t} = \text{Supply}_{t-1} - \text{Burn Fee}$$

### Law 2: Monotonically Non-Decreasing Floor Price (Protocol-Backed Reserve)
Each shielded note requires locking native `NEAR` into the contract's immutable reserve vault (`near_backing_vault`). The intrinsic floor price is defined as:

$$\text{Floor Price}(t) = \frac{\text{NEAR Vault Reserve}(t)}{\text{Circulating Supply}(t)}$$

Because the attached native `NEAR` remains irrevocably locked in the vault while the 1% burn permanently decreases the denominator ($\text{Circulating Supply}$), the intrinsic floor price ratchets upward monotonically on every dark pool transaction:

$$\text{Floor Price}(t) \ge \text{Floor Price}(t-1)$$

This creates an upward-ratcheting settlement asset where high-frequency dark pool volume structurally hardens the token's backing.

### Law 3: Atomic Unlinked Settlement & MEV Immunity
* **Commitment & Recipient Binding:** Cryptographic commitments are generated deterministically as $C = \text{SHA256}(\text{nullifier} \parallel \text{secret} \parallel \text{recipient})$ utilizing NEAR's native host cryptographic functions (`env::sha256`) and `alt_bn128`-compatible primitives. Supports both **Bearer Dark Notes** and **Recipient-Bound Dark Notes**.
* **Anonymity Set & Relayer Decoupling:** Deposits accumulate inside the unified `zilium-clean-1794256999.testnet` liquidity pool across asynchronous time horizons, while settlement execution is decoupled via NEP-366 gasless relayers—preventing gas-payer correlation and breaking direct account-to-account balance transfers on public RPC indexers.
* **NEP-366 Relayer Front-Running Immunity:** By cryptographically binding the target `recipient` inside the commitment and meta-transaction payload (`settle_zk_intent_gasless`), predatory MEV searchers in the public mempool cannot intercept, front-run, or redirect funds even if they observe the settlement transaction.
* **Async Reentrancy & Double-Spend Protection:** Designed specifically for NEAR's asynchronous cross-contract promise execution using the **Checks-Effects-Interactions (CEI)** pattern. The contract validates commitments and registers **Spent Nullifiers** in state strictly *before* issuing any token delivery or callback promises.

---

## 3. Verified Live Testnet Transactions

All mechanics have been executed and verified on NEAR Testnet:

| Step | Action | Method | Transaction Hash / Explorer Link |
| :--- | :--- | :--- | :--- |
| **0** | **Contract Deploy & Groth16 Upgrade** | `deploy_code` | [`CdaCa4Cz6N6JNSHpMyxsJSZShcAqkCmUwWfNhCqFWS4J`](https://testnet.nearblocks.io/txns/CdaCa4Cz6N6JNSHpMyxsJSZShcAqkCmUwWfNhCqFWS4J) |
| **1** | **Agent A Faucet Funding** | `faucet_claim()` | [`CwAc2xzJM3EY1QcjnBvNWj5TtD3KpZXUd4Hjpd5Y2JWh`](https://testnet.nearblocks.io/txns/CwAc2xzJM3EY1QcjnBvNWj5TtD3KpZXUd4Hjpd5Y2JWh) |
| **2** | **ZK Shield Deposit (1% Burn, Poseidon)** | `deposit_zk_shield(commitment)` | [`FqFvpEKvhviZtECoSupXSYRUkAAK6o6nQkoQEC4DBTgY`](https://testnet.nearblocks.io/txns/FqFvpEKvhviZtECoSupXSYRUkAAK6o6nQkoQEC4DBTgY) |
| **3** | **Groth16 BN254 Settlement (`alt_bn128`)** | `settle_zk_snark(proof)` | [`4Z8CVjbC5c1SFCWVwye8hFp6D5ewcc4BzfXWQ1DUmBWk`](https://testnet.nearblocks.io/txns/4Z8CVjbC5c1SFCWVwye8hFp6D5ewcc4BzfXWQ1DUmBWk) |
| **4** | **Floor Arbitrage Redemption** | `redeem_floor_backing(amount)` | [Verified Monotonic Floor Impact](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet) |

- **Agent Alpha (Buyer / Quant Fund):** [`agent-a.zilium-clean-1794256999.testnet`](https://testnet.nearblocks.io/address/agent-a.zilium-clean-1794256999.testnet)
- **Agent Beta (Seller / Liquidity Provider):** [`zilium-agent-b.testnet`](https://testnet.nearblocks.io/address/zilium-agent-b.testnet)
- **Dark Pool Contract Vault:** [`zilium-clean-1794256999.testnet`](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet)

---

## 4. How the Judges Can Verify in 10 Seconds

### Option A: The One-Command Deterministic CLI (Recommended)
Run the following in your terminal to execute the entire live on-chain lifecycle against NEAR Testnet:

```bash
npm run simulate-agents
npm run verify
```

This will:
1. Query initial state via JSON-RPC.
2. Fund Agent Alpha and mint cryptographic note.
3. Lock ZLM, execute 1% deflationary burn, and back vault with native NEAR.
4. Settle unlinked funds to Agent Beta in sub-50ms with zero sender link.
5. Validate all mathematical invariants on-chain with verified Explorer links.

### Option B: Direct RPC Query (Raw JSON)
```bash
curl -X POST https://near-testnet.drpc.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"query","params":{"request_type":"call_function","finality":"optimistic","account_id":"zilium-clean-1794256999.testnet","method_name":"get_protocol_state","args_base64":"e30="}}'
```

### Option C: Institutional Interactive Dashboard
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to inspect the live SVG topology DAG, test the Attack Simulation (Public Chain x402 vs Zilium ZK), and execute all 4 mechanics interactively.

---

## 5. Monorepo Structure

```
zilium/
├── circuits/                       # Circom 2.0 Poseidon BN254 Groth16 Circuit
│   ├── zilium_withdraw.circom      # Private (nullifier, secret) + Public recipientHash
│   ├── verification_key.json       # Groth16 BN254 verification key
│   └── zilium_withdraw_final.zkey  # Phase-2 proving key
├── contract/                       # NEAR Protocol Smart Contract (Rust, near-sdk 5.5.0)
│   ├── Cargo.toml                  # Target: wasm32-unknown-unknown
│   └── src/
│       ├── lib.rs                  # NEP-141/145/297/366 + ZK Shield + settle_zk_snark + Intents
│       └── zk_verifier.rs          # Native alt_bn128_g1_multiexp / g1_sum / pairing_check
└── web/                            # Next.js 14 Institutional Web Terminal (Bloomberg Dark Pool)
    ├── public/zk/                  # Browser prover artifacts (wasm + zkey)
    ├── src/
    │   ├── app/                    # 3-Tab Terminal (Dark Pool, Attack Battle, Telemetry)
    │   │   ├── api/settle-relay/   # NEP-366 & Groth16 Gasless Relayer API Route
    │   │   └── api/x402-inference/ # HTTP 402 Payment Required Machine-Payable Gate
    │   └── lib/
    │       ├── zk-snark.ts         # Browser/Node snarkjs Groth16 BN254 Prover
    │       ├── near-zk.ts          # WebCrypto SHA-256 Engine + JSON-RPC client
    │       ├── state-machine.ts    # Deterministic contract mirror for offline demo
    │       ├── agent-simulation.ts # Live A2A terminal execution suite
    │       └── verify-cli.ts       # On-chain judge verification suite
    └── package.json
```

---

## 6. Official NEAR Standards Adherence

- **NEP-141**: Fungible Token Standard Core (`ft_transfer`, `ft_transfer_call`, `ft_total_supply`, `ft_balance_of`).
- **NEP-145**: Storage Management (`storage_deposit`, `storage_withdraw`, `storage_unregister`).
- **NEP-148**: Fungible Token Metadata Standard.
- **NEP-297**: Structured `EVENT_JSON` Logs (`ft_burn` with `"version":"1.0.0"`).
- **NEP-366**: Delegate Actions & Meta-Transactions (`/api/settle-relay`, `settle_zk_intent_gasless`).
- **NEAR Intents Receiver**: Native `ft_on_transfer` interface enabling atomic cross-contract calls in a single block.
- **HTTP 402 (x402)**: Machine-payable inference gate (`/api/x402-inference`) backed by Groth16 `settle_zk_snark` verification.
