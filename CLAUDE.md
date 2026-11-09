# CLAUDE.md - Zilium Protocol Architecture & Guidelines

## 1. System Identity & Mission
- **Project:** Zilium Protocol ($ZLM)
- **Track:** Memecoins With Mechanics / Privacy & Autonomous AI on NEAR Protocol.
- **Core Thesis:** Autonomous Agent-to-Agent (A2A) deflationary currency with monotonically non-decreasing intrinsic floor price and unlinked settlement.
- **Judge Philosophy:** "Evaluated strictly on the mechanics, not the chart." Zero heuristics, fail-closed state invariants, deterministic single-block settlement.

---

## 2. On-Chain Contracts & Infrastructure
- **Network:** NEAR Testnet (`https://rpc.testnet.near.org`)
- **Live Contract ID:** `zilium-clean-1794256999.testnet`
- **Explorer:** [https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet)
- **Secondary Test Agent:** `zilium-agent-b.testnet`
- **Standards Implemented:**
  - `NEP-141`: Fungible Token Standard Core (`ft_transfer`, `ft_transfer_call`, `ft_balance_of`, `ft_total_supply`)
  - `NEP-145`: Storage Management Standard (`storage_deposit`, `storage_withdraw`, `storage_unregister`)
  - `NEP-148`: Fungible Token Metadata Standard
  - `NEP-141 Receiver`: `FungibleTokenReceiver::ft_on_transfer` for single-block atomic NEAR Intents

---

## 3. Formal Invariants & Rules

1. **Deflationary Burn Invariant:**
   - Every dark pool deposit of $1,000 \text{ ZLM}$ incurs an exact $1\% \text{ burn}$ (10 ZLM destroyed permanently).
   - $\text{Supply}_{t} = \text{Supply}_{t-1} - 10 \text{ ZLM}$.
   - Suministro total es estrictamente no creciente ($\le 21,000,000 \text{ ZLM}$).

2. **Monotonic Floor Price Guarantee:**
   - $\text{Floor Price}(t) = \frac{\text{NEAR Vault Reserve}(t)}{\text{Circulating Supply}(t)}$
   - Deposits increment the numerator ($\ge +0.1 \text{ NEAR}$) while burns decrement the denominator ($-10 \text{ ZLM}$).
   - Floor price is monotonically non-decreasing.

3. **Unlinked Double-Spend Prevention:**
   - Commitment: $C = \text{SHA256}(\text{nullifier} \parallel \text{secret})$.
   - Nullifier Spent Check: $\text{SHA256}(\text{nullifier}) \in \text{Nullifiers}$.
   - Zero on-chain link between the depositing agent and the receiving agent.

4. **Arbitrage Floor Redemption (`redeem_floor_backing`):**
   - Any agent can burn $ZLM$ at any block to withdraw its exact proportional share of the NEAR vault.

---

## 4. Repository Structure & Commands

```
zilium/
├── contract/              # NEAR Rust Smart Contract (WASM)
│   ├── Cargo.toml         # near-sdk 5.5.0
│   └── src/lib.rs         # Protocol implementation
├── web/                   # Next.js 14 App Router UI & Telemetry
│   ├── src/app/           # Institutional DAG Topology & UI
│   └── src/lib/           # WebCrypto SHA-256 & verify-cli.ts
├── CLAUDE.md              # Project instructions & architectural reference
├── README.md              # Public hackathon submission documentation
└── package.json           # Monorepo task forwarder
```

### Essential CLI Commands

```bash
# Verify the entire on-chain lifecycle in live Testnet (Judge evaluation command)
npm run verify

# Start Next.js web application (Dashboard & DAG topology)
npm run dev

# Production build of the web app
npm run build

# Start production web server
npm run start

# Recompile Rust contract to WebAssembly
cd contract
cargo build --target wasm32-unknown-unknown --release
```

---

## 5. Development Invariants & Style
- **Strict Typing:** All TypeScript under `strict: true`. Zero `any` or untyped structures.
- **Fail-Closed:** Smart contract operations must assert preconditions and revert immediately on invalid preimages or insufficient balances.
- **Tone & Terminology:** Maintain institutional, quantitative engineering tone. Avoid informal analogies or framing the currency as a "commodity".

