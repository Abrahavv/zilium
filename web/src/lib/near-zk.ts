import { ProtocolState, ZkNoteTicket } from "./types";

export const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "zilium-clean-1794256999.testnet";
export const NETWORK_ID = "testnet";
export const RPC_FALLBACK_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL || "https://near-testnet.drpc.org",
  "https://rpc.testnet.near.org",
  "https://test.rpc.fastnear.com",
];
export const RPC_URL = RPC_FALLBACK_URLS[0];

async function callRpcWithFallback(body: object): Promise<any> {
  let lastErr = null;
  for (const url of RPC_FALLBACK_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        if (json && !json.error) return json;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All RPC endpoints failed");
}

/**
 * Deterministic In-Browser Cryptographic Generator
 * Computes Commitment = SHA256(Nullifier || Secret || RecipientId) via WebCrypto
 */
export async function generateZkCommitment(
  recipientId = "",
  tier: 1 | 2 | 3 = 1
): Promise<ZkNoteTicket> {
  const nullifier = window.crypto.getRandomValues(new Uint8Array(32));
  const secret = window.crypto.getRandomValues(new Uint8Array(32));

  // Pure Bearer Privacy Note (Tornado Cash Standard): SHA256(nullifier || secret)
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
    recipientId: recipientId.trim(),
    tier,
    timestamp: Date.now(),
  };
}

/**
 * JSON-RPC query for real-time protocol state
 */
export async function fetchProtocolTelemetry(): Promise<ProtocolState> {
  try {
    const data = await callRpcWithFallback({
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
    });

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
  } catch {
    return {
      current_supply: "21000000000000",
      total_burned: "0",
      near_vault_backing: "0",
      floor_price_yocto_per_zlm: "0",
      active_zk_notes: 0,
    };
  }
}

/**
 * Fetch token balance of an account
 */
export async function fetchTokenBalance(accountId: string): Promise<string> {
  try {
    const data = await callRpcWithFallback({
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
    });
    if (!data.result?.result) return "0";
    const decoded = new TextDecoder().decode(new Uint8Array(data.result.result));
    return JSON.parse(decoded);
  } catch {
    return "0";
  }
}
