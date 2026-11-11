---
name: zilium-zk-security-and-institutional-ux
description: Specialist in Rust smart contract security on NEAR (near-sdk 5.5.0), cryptographic ZK/Commit-Reveal anti-MEV privacy, and institutional financial terminal design in Next.js 14.
---

# Zilium Protocol ($ZLM): Security, ZK Cryptography & Institutional UX Rules

## 1. Smart Contract Security Rules (Rust / `near-sdk 5.5.0`)
- **Strict Cryptoeconomic Invariants (Checks-Effects-Interactions):**
  - Always verify `env::attached_deposit() >= min_shield_deposit` before mutating state in `deposit_zk_shield`.
  - Execute 1% deflationary burn by decrementing `total_supply` using safe arithmetic (`checked_sub`) before committing notes into `active_commitments`.
  - Enforce monotonic floor invariant by unit test: `floor_price(t) >= floor_price(t-1)` across every state transition.
- **Reentrancy and Asynchronous Failure Protection on NEAR:**
  - In `settle_zk_intent`, insert `nullifier_hash` into `spent_nullifiers` **strictly before** issuing any `Promise` or NEP-141 token transfer.
  - If a cross-contract call (`ft_transfer_call` / `ft_on_transfer`) fails in the private callback (`#[private]`), revert only token delivery without double-counting supply or unlocking NEAR vault reserves inconsistently.
- **Storage Staking Management (NEP-145):**
  - Prevent Storage Exhaustion attacks on `LookupSet` / `UnorderedSet` commitment collections by ensuring attached deposits cover byte costs (`env::storage_byte_cost()`).

## 2. ZK Privacy and MEV Resistance Rules (`near-zk.ts` & `lib.rs`)
- **Mempool Front-Running Immunity:**
  - Every commitment $C$ MUST cryptographically bind the recipient `AccountId`: $C = \text{SHA256}(\text{nullifier} \parallel \text{secret} \parallel \text{recipient\_id})$ or as a public input signal in Groth16 circuits over `alt_bn128`.
  - The contract MUST assert that altering `recipient_id` in transit immediately invalidates the commitment preimage verification.
- **Client-Side Cryptographic Hygiene (WebCrypto API):**
  - Generate `nullifier` and `secret` exclusively via `crypto.getRandomValues(new Uint8Array(32))` (256 bits of true entropy). `Math.random()` is strictly banned.
  - Never log (`console.log`) plaintext preimages or transmit secrets via external HTTP telemetry.
- **Verifiable Graph Unlinking:**
  - Public RPC state for `zilium-agent-b.testnet` must NEVER contain references to Agent A's `AccountId` nor 1:1 correlated timestamps when multiple notes exist in the pool.

## 3. Institutional UX/UI Rules (Next.js 14 Terminal)
- **"Dark Pool / Bloomberg Crypto Terminal" Aesthetic:**
  - Ultra-dark base background (`#06080D`), technical borders (`1px solid rgba(255,255,255,0.08)`), monospace typography (`JetBrains Mono` or `Geist Mono`) for hashes, mathematical deltas, sub-50ms execution latencies, and NEAR vault reserves.
- **Dual Visual Contrast Mode (x402 vs. Zilium):**
  - Always render real-time comparative visualization:
    - **x402 Vulnerability Column (Red / Amber):** Nodes connected in `#EF4444`, indicating *Metadata Leaked*, *Counterparty Exposed*, and *MEV Vulnerable*.
    - **Zilium Shielded Column (Emerald / Cyan):** Nodes in `#10B981` with SVG broken-graph air-gap, indicating *Sender: UNLINKED*, *Strategy: ZERO-KNOWLEDGE*, and *Floor Price Delta: +Δ NEAR*.
- **1-Click Judge Verifiability:**
  - Every lifecycle step (Mine -> Shield -> Burn -> Settle) MUST provide direct links to the NEAR Testnet Explorer, exact millisecond timestamps, and a 1-click button to copy the verification JSON-RPC curl command.
