# Zilium Protocol ($ZLM) - Hackathon Submission & Pitch Script

## 1. Quick Form Metadata (For Hackathon Submission Portal)

- **Project Name:** Zilium Protocol
- **Token Symbol:** $ZLM
- **Track Selection:**
  - **Primary Track:** `Agent Economy` (Private economic settlement rail for autonomous AI agent-to-agent transactions)
  - **Secondary Tracks:** `Privacy & Private AI` | `Memecoins With Mechanics`
- **One-Liner / Value Proposition:**
  "Zilium is the privacy and economic settlement rail for the Agent Economy on NEAR: an autonomous A2A deflationary currency featuring a monotonically increasing floor price backed by NEAR reserves and unlinked atomic settlement in a single block."
- **Contract ID (NEAR Testnet):** [`zilium-clean-1794256999.testnet`](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet)
- **Explorer:** [https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet](https://testnet.nearblocks.io/address/zilium-clean-1794256999.testnet)
- **GitHub Repository:** `<YOUR_GITHUB_REPO_URL>`
- **Live Web Application (Vercel):** `<YOUR_VERCEL_URL>`
- **Test Commands for Evaluators:**
  ```bash
  git clone <REPO_URL>
  cd zilium
  npm run verify
  ```

---

## 2. High-Impact Pitch Script (Video Demo: 2 Minutes 30 Seconds)

### [0:00 - 0:35] The Unsolved Bottleneck
> *"Hi judges. Autonomous AI agents are becoming the primary economic actors on NEAR. But public blockchains have a fatal flaw for automated intelligence: **complete lack of privacy and lack of verifiable asset backing**.
> When Agent A pays Agent B for proprietary data, order-flow signals, or compute, their trading graph and alpha leak to every MEV bot on-chain.
> Standard tokens and memecoins offer zero privacy and zero intrinsic floor.
> We built **Zilium ($ZLM)**: a deterministic, fail-closed deflationary currency and unlinked settlement protocol written in Rust on NEAR, designed specifically for autonomous agent-to-agent economies."*

### [0:35 - 1:20] The Mathematical Mechanics ($1 + 1 = 2$)
*(Screen share showing the terminal executing `npm run verify`)*
> *"Zilium doesn't promise roadmaps. It enforces three strict cryptoeconomic invariants at the virtual machine level:
> 
> **First: Strict 21M Hard Cap with 1% Deflation.** There are exactly 21,000,000 ZLM minted at genesis. No new tokens can ever be minted. Every time an agent deposits into the privacy dark pool, exactly 10 ZLM (1%) is permanently burned from total supply. As you can see right here on the terminal, the circulating supply dropped from 21M to 20,999,990 ZLM.
> 
> **Second: Monotonically Non-Decreasing Floor Price.** To shield funds, the agent must attach at least 0.1 NEAR, which locks into the immutable contract reserve vault. Because the NEAR reserve only increases while ZLM supply only burns, the floor price can mathematically never go down.
> 
> **Third: Arbitrage Liquidity Guarantee.** Any agent can call `redeem_floor_backing` at any block to burn ZLM and immediately withdraw its exact proportional share of the NEAR vault."*

### [1:20 - 2:05] Live Web Terminal & Meteor Wallet Demo
*(Screen share showing `http://localhost:3000` / Vercel with Meteor Wallet pop-up)*
> *"Here is the Zilium Web Terminal. We integrated the official `@near-wallet-selector` supporting Meteor Wallet and MyNearWallet with zero private key inputs.
> 
> 1. We connect our Meteor Wallet on Testnet.
> 2. The interactive SVG topology DAG visualizes the transaction flow in real time.
> 3. We execute `deposit_zk_shield`: our browser generates an ephemeral 32-byte Nullifier and Secret via native WebCrypto, submits the SHA-256 commitment on-chain, and burns 1% of the note.
> 4. Agent B settles the intent atomically in a single block without revealing any cryptographic link to Agent A."*

### [2:05 - 2:30] Standards & Engineering Rigor
*(Screen share showing NearBlocks verified transactions)*
> *"Zilium adheres 100% to official NEAR standards:
> - **NEP-141** Fungible Token Core.
> - **NEP-145** Storage Management.
> - **NEAR Intents Receiver (`ft_on_transfer`)** for atomic single-block settlements.
> 
> The contract is live right now on NEAR Testnet at `zilium-clean-1794256999.testnet`. You can verify the entire lifecycle yourself in five seconds by running `npm run verify`.
> Thank you."*

---

## 3. Anticipated Judge Q&A & Bulletproof Defense

### Q1 (From Eddy Lazzarin / a16z): "Why SHA-256 commitments instead of Groth16 zk-SNARK circuits?"
> **Answer:** *"Autonomous AI agents require sub-second settlement and sub-cent gas fees. Full zk-SNARK client-side proving (like snarkjs or rapid-snark) requires downloading 30-50MB proving keys and running WASM multi-exponentiations that stall agent inference loops. By enforcing deterministic commitment-nullifier verification in NEAR's native hash precompile (`env::sha256`), Zilium achieves single-block dark pool settlement with under 10 Tgas, fitting seamlessly into autonomous A2A execution pipelines while remaining fully upgradeable to native BN254 Groth16 verification via NEAR's `alt_bn128` precompile."*

### Q2 (From Illia Polosukhin / NEAR): "How does this fit the NEAR Intents vision?"
> **Answer:** *"Zilium natively implements `FungibleTokenReceiver` (`ft_on_transfer`). Any market maker, solver, or cross-chain intent network can deposit ZLM into a private dark note or settle cross-contract swaps in a single transaction without multi-step bridges or escrow accounts."*

### Q3 (From Mert Mumtaz / Helius): "What prevents double-spends or front-running?"
> **Answer:** *"The contract maintains a state-isolated `UnorderedSet` of spent nullifier hashes. When Agent B settles an intent, `nullifier_hash = SHA256(nullifier)` is immediately verified and marked as spent. Any mempool front-runner attempting to reuse the pre-image reverts immediately at block execution."*

