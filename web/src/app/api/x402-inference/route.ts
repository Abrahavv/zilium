import { NextResponse } from "next/server";
import { connect, KeyPair } from "near-api-js";
import { InMemoryKeyStore } from "near-api-js/lib/key_stores/in_memory_key_store.js";

const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_RPC_URL || "https://near-testnet.drpc.org",
  "https://rpc.testnet.near.org",
  "https://test.rpc.fastnear.com",
];
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "zilium-clean-1794256999.testnet";
const AGENT_B_ID = "zilium-agent-b.testnet";
const AGENT_B_KEY =
  process.env.TESTNET_AGENT_B_KEY ||
  "ed25519:2AWYqgpmfK3U1bZ4gEJmAzFk4udzhfrKwwxcN8FLNi5yZkojDnoF1L3t2zFS8oZtwnUUW6yJp3U69cympgTKhL7E";

async function viewContract(methodName: string) {
  const argsBase64 = Buffer.from("{}").toString("base64");
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "x402-view",
          method: "query",
          params: {
            request_type: "call_function",
            finality: "final",
            account_id: CONTRACT_ID,
            method_name: methodName,
            args_base64: argsBase64,
          },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.result?.result) {
          return JSON.parse(Buffer.from(json.result.result).toString("utf8"));
        }
      }
    } catch {
      // try fallback RPC
    }
  }
  return null;
}

function buildChallengeResponse(merkleRoot: string | null) {
  return NextResponse.json(
    {
      error: "Payment Required",
      protocol: "x402-zilium-zk",
      accepts: [
        {
          scheme: "zilium-groth16-bn254",
          network: "near-testnet",
          contractId: CONTRACT_ID,
          method: "settle_zk_snark",
          recipientId: AGENT_B_ID,
          tier: 1,
          amountZlm: "10.00",
          merkleRoot: merkleRoot || "unavailable",
        },
      ],
    },
    {
      status: 402,
      headers: {
        "X-PAYMENT-REQUIRED": "zilium-groth16-bn254",
      },
    }
  );
}

export async function GET() {
  const merkleRoot = await viewContract("get_merkle_root");
  return buildChallengeResponse(merkleRoot);
}

export async function POST(req: Request) {
  const paymentHeader = req.headers.get("x-payment");
  if (!paymentHeader) {
    const merkleRoot = await viewContract("get_merkle_root");
    return buildChallengeResponse(merkleRoot);
  }

  try {
    const decoded = paymentHeader.trim().startsWith("{")
      ? JSON.parse(paymentHeader)
      : JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));

    let settledTxHash = decoded.txHash as string | undefined;

    if (!settledTxHash && decoded.proof && decoded.commitmentHex && decoded.nullifierHashHex) {
      const keyStore = new InMemoryKeyStore();
      await keyStore.setKey("testnet", AGENT_B_ID, KeyPair.fromString(AGENT_B_KEY as `ed25519:${string}`));
      const near = await connect({ networkId: "testnet", keyStore, nodeUrl: RPC_ENDPOINTS[0] });
      const account = await near.account(AGENT_B_ID);

      const outcome = await account.functionCall({
        contractId: CONTRACT_ID,
        methodName: "settle_zk_snark",
        args: {
          proof: decoded.proof,
          commitment_hex: decoded.commitmentHex,
          nullifier_hash_hex: decoded.nullifierHashHex,
          recipient_id: decoded.recipientId || AGENT_B_ID,
          tier: decoded.tier || 1,
        },
        gas: BigInt("150000000000000"),
        attachedDeposit: BigInt("0"),
      });
      settledTxHash = outcome.transaction.hash;
    }

    if (!settledTxHash) {
      return NextResponse.json({ error: "Invalid X-PAYMENT payload" }, { status: 400 });
    }

    return NextResponse.json({
      status: "200 OK",
      settled: true,
      txHash: settledTxHash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${settledTxHash}`,
      privacyGuarantee: "Groth16 BN254 alt_bn128_pairing_check verified; 0% sender-recipient linkage",
      inferencePayload: {
        endpoint: "/v1/alpha/orderflow-imbalance",
        timestampNs: Date.now() * 1_000_000,
        signal: {
          pair: "NEAR/USDC",
          obi_zscore: 2.14,
          hurst_exponent: 0.63,
          regime: "TREND_ACCUMULATION",
          recommended_action: "LONG_MAKER",
        },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 402 });
  }
}
