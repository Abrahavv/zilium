import { NextResponse } from "next/server";
import { KeyPair, connect } from "near-api-js";
import { InMemoryKeyStore } from "near-api-js/lib/key_stores/in_memory_key_store.js";

const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_RPC_URL || "https://near-testnet.drpc.org",
  "https://rpc.testnet.near.org",
  "https://test.rpc.fastnear.com",
];
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "zilium-clean-1794256999.testnet";
const AGENT_B_KEY =
  process.env.TESTNET_AGENT_B_KEY ||
  "ed25519:2AWYqgpmfK3U1bZ4gEJmAzFk4udzhfrKwwxcN8FLNi5yZkojDnoF1L3t2zFS8oZtwnUUW6yJp3U69cympgTKhL7E";
const MASTER_KEY =
  process.env.TESTNET_MASTER_KEY ||
  "ed25519:3kEZ6qkASQfvhyHaLbSTHVszYBPXSq4ZFJ3XzUPDY9ZRME9Sfmn2ukosYxV8tj92UYipFhQ2SV2P2j6g3Ux4BESo";

async function broadcastSignedDelegate(signedTxBase64: string) {
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "nep366-relay",
          method: "broadcast_tx_commit",
          params: [signedTxBase64],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.result?.transaction?.hash) {
          return json.result;
        }
      }
    } catch {
      // try next RPC
    }
  }
  throw new Error("All RPC endpoints failed to broadcast NEP-366 transaction");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Mode 1: Raw NEP-366 SignedDelegate / SignedTransaction broadcast
    if (body.signedDelegateBase64) {
      const result = await broadcastSignedDelegate(body.signedDelegateBase64);
      return NextResponse.json({
        success: true,
        mode: "nep366-delegate",
        txHash: result.transaction.hash,
        signerId: result.transaction.signer_id,
      });
    }

    const targetRecipient = (body.recipientId || "zilium-agent-b.testnet").trim();
    const isAgentB = targetRecipient === "zilium-agent-b.testnet";
    const signerId = isAgentB ? "zilium-agent-b.testnet" : CONTRACT_ID;
    const signerKey = isAgentB ? AGENT_B_KEY : MASTER_KEY;

    const keyStore = new InMemoryKeyStore();
    const keyPair = KeyPair.fromString(signerKey as `ed25519:${string}`);
    await keyStore.setKey("testnet", signerId, keyPair);

    const near = await connect({
      networkId: "testnet",
      keyStore,
      nodeUrl: RPC_ENDPOINTS[0],
    });
    const account = await near.account(signerId);

    // Mode 2: Groth16 BN254 ZK-SNARK Settlement (alt_bn128_pairing_check)
    if (body.proof && body.commitmentHex && body.nullifierHashHex) {
      const outcome = await account.functionCall({
        contractId: CONTRACT_ID,
        methodName: "settle_zk_snark",
        args: {
          proof: body.proof,
          commitment_hex: body.commitmentHex,
          nullifier_hash_hex: body.nullifierHashHex,
          recipient_id: targetRecipient,
          tier: body.tier || 1,
        },
        gas: BigInt("150000000000000"),
        attachedDeposit: BigInt("0"),
      });

      return NextResponse.json({
        success: true,
        mode: "groth16-snark",
        txHash: outcome.transaction.hash,
        signerId,
        recipientId: targetRecipient,
      });
    }

    // Mode 3: Commit-Reveal fallback
    const { nullifierHex, secretHex, tier } = body;
    if (!nullifierHex || !secretHex) {
      return NextResponse.json({ error: "Missing note credentials or Groth16 proof" }, { status: 400 });
    }

    const outcome = await account.functionCall({
      contractId: CONTRACT_ID,
      methodName: "settle_zk_intent",
      args: {
        nullifier_hex: nullifierHex,
        secret_hex: secretHex,
        recipient_id: targetRecipient,
        tier: tier || 1,
      },
      gas: BigInt("100000000000000"),
      attachedDeposit: BigInt("0"),
    });

    return NextResponse.json({
      success: true,
      mode: "commit-reveal",
      txHash: outcome.transaction.hash,
      signerId,
      recipientId: targetRecipient,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
