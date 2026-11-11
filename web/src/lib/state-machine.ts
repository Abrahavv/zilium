import { ProtocolState, StateMachineLog, ZkNoteTicket } from "./types";

const INITIAL_SUPPLY = BigInt("21000000000000"); // 21,000,000.000000 (6 decimals)
const INITIAL_VAULT = BigInt("1000000000000000000000000"); // 1.0 NEAR (yoctoNEAR)
const NOTE_AMOUNT = BigInt("1000000000"); // 1,000 ZLM
const BURN_AMOUNT = BigInt("10000000"); // 10 ZLM (1%)
const BACKING_ATTACHED = BigInt("100000000000000000000000"); // 0.1 NEAR

export class DeterministicZiliumEngine {
  private supply: bigint = INITIAL_SUPPLY;
  private burned: bigint = BigInt(0);
  private vault: bigint = INITIAL_VAULT;
  private commitments: Set<string> = new Set();
  private nullifiers: Set<string> = new Set();
  private userBalance: bigint = BigInt("2000000000"); // 2,000 ZLM initial user wallet balance
  private logs: StateMachineLog[] = [];

  constructor() {
    this.recompute();
  }

  public getState(): ProtocolState {
    const floor = this.supply > BigInt(0)
      ? (this.vault * BigInt(1_000_000)) / this.supply
      : BigInt(0);

    const active = Math.max(0, this.commitments.size - this.nullifiers.size);

    return {
      current_supply: this.supply.toString(),
      total_burned: this.burned.toString(),
      near_vault_backing: this.vault.toString(),
      floor_price_yocto_per_zlm: floor.toString(),
      active_zk_notes: active,
    };
  }

  public getUserBalance(): string {
    return this.userBalance.toString();
  }

  public getLogs(): StateMachineLog[] {
    return [...this.logs].reverse();
  }

  public faucetClaim(accountId: string): { success: boolean; message: string } {
    const FAUCET_AMOUNT = BigInt("2000000000"); // 2,000 ZLM
    this.userBalance += FAUCET_AMOUNT;

    this.logs.push({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: "FAUCET",
      details: `Minted 2,000 ZLM test tokens to ${accountId}`,
      deltaSupply: "+0",
      deltaBurned: "+0",
      deltaVault: "+0",
    });

    return { success: true, message: `Allocated 2,000.00 ZLM to ${accountId}` };
  }

  public depositShield(ticket: ZkNoteTicket): { success: boolean; message: string } {
    const totalRequired = NOTE_AMOUNT + BURN_AMOUNT;
    if (this.userBalance < totalRequired) {
      return { success: false, message: "Insufficient ZLM balance (Requires 1,010 ZLM)" };
    }

    if (this.commitments.has(ticket.commitmentHex)) {
      return { success: false, message: "Commitment already exists in Shield pool" };
    }

    this.userBalance -= totalRequired;
    this.supply -= BURN_AMOUNT;
    this.burned += BURN_AMOUNT;
    this.vault += BACKING_ATTACHED;
    this.commitments.add(ticket.commitmentHex);

    this.logs.push({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: "SHIELD_DEPOSIT",
      details: `Shielded 1,000 ZLM | Burned 10 ZLM | Backed +0.1 NEAR`,
      deltaSupply: "-10 ZLM",
      deltaBurned: "+10 ZLM",
      deltaVault: "+0.10 NEAR",
    });

    return { success: true, message: "ZK Note Shielded & 1% Deflationary Burn Executed" };
  }

  public async settleIntent(
    nullifierHex: string,
    secretHex: string,
    recipientId: string
  ): Promise<{ success: boolean; message: string }> {
    // 1. Recompute SHA256(nullifier || secret || recipientId)
    const nullifierBytes = new Uint8Array(
      nullifierHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const secretBytes = new Uint8Array(
      secretHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
    const recipientBytes = new TextEncoder().encode(recipientId);

    const preimage = new Uint8Array(64 + recipientBytes.length);
    preimage.set(nullifierBytes, 0);
    preimage.set(secretBytes, 32);
    preimage.set(recipientBytes, 64);

    const hashBuffer = await window.crypto.subtle.digest("SHA-256", preimage);
    const computedCommitment = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (!this.commitments.has(computedCommitment)) {
      return { success: false, message: "Invalid ZK Preimage: Commitment not found" };
    }

    // 2. Compute nullifier hash
    const nullifierHashBuf = await window.crypto.subtle.digest("SHA-256", nullifierBytes);
    const nullifierHash = Array.from(new Uint8Array(nullifierHashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (this.nullifiers.has(nullifierHash)) {
      return { success: false, message: "Double-Spend Reverted: Nullifier already settled" };
    }

    this.nullifiers.add(nullifierHash);

    this.logs.push({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: "SETTLE",
      details: `Settled unlinked 1,000 ZLM note to ${recipientId}`,
      deltaSupply: "0",
      deltaBurned: "0",
      deltaVault: "0",
    });

    return { success: true, message: `Transferred 1,000 ZLM to ${recipientId} without sender link` };
  }

  public redeemFloor(burnZlmRaw: string): { success: boolean; nearPayoutYocto: string; message: string } {
    const burnAmount = BigInt(burnZlmRaw);
    if (burnAmount <= BigInt(0)) {
      return { success: false, nearPayoutYocto: "0", message: "Amount must be > 0" };
    }
    if (this.userBalance < burnAmount) {
      return { success: false, nearPayoutYocto: "0", message: "Insufficient balance to redeem" };
    }
    if (this.supply === BigInt(0)) {
      return { success: false, nearPayoutYocto: "0", message: "Supply is zero" };
    }

    const nearPayout = (burnAmount * this.vault) / this.supply;
    if (nearPayout === BigInt(0)) {
      return { success: false, nearPayoutYocto: "0", message: "Redeem yields 0 NEAR" };
    }

    this.userBalance -= burnAmount;
    this.supply -= burnAmount;
    this.burned += burnAmount;
    this.vault -= nearPayout;

    this.logs.push({
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      type: "REDEEM_FLOOR",
      details: `Arbitraged ${Number(burnAmount) / 1e6} ZLM -> ${(Number(nearPayout) / 1e24).toFixed(4)} NEAR`,
      deltaSupply: `-${Number(burnAmount) / 1e6} ZLM`,
      deltaBurned: `+${Number(burnAmount) / 1e6} ZLM`,
      deltaVault: `-${(Number(nearPayout) / 1e24).toFixed(4)} NEAR`,
    });

    return {
      success: true,
      nearPayoutYocto: nearPayout.toString(),
      message: `Burned ${Number(burnAmount) / 1e6} ZLM and extracted ${(Number(nearPayout) / 1e24).toFixed(6)} NEAR`,
    };
  }

  private recompute() {
    // Initial active notes
    this.commitments.add("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  }
}

