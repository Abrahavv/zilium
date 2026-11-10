import { ProtocolState, ZkNoteTicket } from "./types";

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "zilium-clean-1794256999.testnet";
export const NETWORK_ID = "testnet";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://test.rpc.fastnear.com";

/**
 * Deterministic In-Browser Cryptographic Generator
 * Computes Commitment = SHA256(Nullifier || Secret) via WebCrypto
 */
export async function generateZkCommitment(): Promise<ZkNoteTicket> {
  const nullifier = window.crypto.getRandomValues(new Uint8Array(32));
  const secret = window.crypto.getRandomValues(new Uint8Array(32));

  const preimage = new Uint8Array(64);
  preimage.set(nullifier, 0);
  preimage.set(secret, 32);

  const hashBuffer = await window.crypto.subtle.digest("SHA-256", preimage);
  const commitment = new Uint8Array(hashBuffer);

  const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  return {
    nullifierHex: toHex(nullifier),
    secretHex: toHex(secret),
    commitmentHex: toHex(commitment),
    timestamp: Date.now(),
  };
}

/**
 * JSON-RPC query for real-time protocol state
 */
export async function fetchProtocolTelemetry(): Promise<ProtocolState> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "zilium-telemetry",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: CONTRACT_ID,
        method_name: "get_protocol_state",
        args_base64: btoa("{}"),
      },
    }),
  });

  const data = await res.json();
  if (!data.result?.result) {
    return {
      current_supply: "21000000000000",
      total_burned: "0",
      near_vault_backing: "0",
      floor_price_yocto_per_zlm: "0",
      active_zk_notes: 0,
    };
  }

  const decoded = new TextDecoder().decode(new Uint8Array(data.result.result));
  return JSON.parse(decoded);
}

/**
 * Fetch token balance of an account
 */
export async function fetchTokenBalance(accountId: string): Promise<string> {
  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "zilium-balance",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "optimistic",
          account_id: CONTRACT_ID,
          method_name: "ft_balance_of",
          args_base64: btoa(JSON.stringify({ account_id: accountId })),
        },
      }),
    });
    const data = await res.json();
    if (!data.result?.result) return "0";
    const decoded = new TextDecoder().decode(new Uint8Array(data.result.result));
    return JSON.parse(decoded);
  } catch {
    return "0";
  }
}
