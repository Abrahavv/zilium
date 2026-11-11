export interface ProtocolState {
  current_supply: string;
  total_burned: string;
  near_vault_backing: string;
  floor_price_yocto_per_zlm: string;
  active_zk_notes: number;
}

export interface ZkNoteTicket {
  nullifierHex: string;
  secretHex: string;
  commitmentHex: string;
  recipientId: string;
  tier: 1 | 2 | 3;
  timestamp: number;
}

export interface SettlementResult {
  success: boolean;
  txHash?: string;
  recipient: string;
  amountZlm: number;
  unlinked: boolean;
}

export interface StateMachineLog {
  id: string;
  timestamp: number;
  type: "FAUCET" | "SHIELD_DEPOSIT" | "SETTLE" | "REDEEM_FLOOR";
  details: string;
  deltaSupply: string;
  deltaBurned: string;
  deltaVault: string;
}

