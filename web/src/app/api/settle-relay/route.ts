import { NextResponse } from "next/server";
import { KeyPair } from "near-api-js";
import { InMemoryKeyStore } from "near-api-js/lib/key_stores/in_memory_key_store.js";
import { connect } from "near-api-js";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://near-testnet.drpc.org";
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID || "zilium-clean-1794256999.testnet";
const AGENT_B_KEY = process.env.TESTNET_AGENT_B_KEY || "ed25519:2AWYqgpmfK3U1bZ4gEJmAzFk4udzhfrKwwxcN8FLNi5yZkojDnoF1L3t2zFS8oZtwnUUW6yJp3U69cympgTKhL7E";
const MASTER_KEY = process.env.TESTNET_MASTER_KEY || "ed25519:3kEZ6qkASQfvhyHaLbSTHVszYBPXSq4ZFJ3XzUPDY9ZRME9Sfmn2ukosYxV8tj92UYipFhQ2SV2P2j6g3Ux4BESo";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nullifierHex, secretHex, recipientId, tier } = body;

    if (!nullifierHex || !secretHex) {
      return NextResponse.json({ error: "Missing note credentials" }, { status: 400 });
    }

    const targetRecipient = (recipientId || "zilium-agent-b.testnet").trim();
    const isAgentB = targetRecipient === "zilium-agent-b.testnet";
    const signerId = isAgentB ? "zilium-agent-b.testnet" : CONTRACT_ID;
    const signerKey = isAgentB ? AGENT_B_KEY : MASTER_KEY;

    const keyStore = new InMemoryKeyStore();
    const keyPair = KeyPair.fromString(signerKey as `ed25519:${string}`);
    await keyStore.setKey("testnet", signerId, keyPair);

    const near = await connect({
      networkId: "testnet",
      keyStore,
      nodeUrl: RPC_URL,
    });

    const account = await near.account(signerId);

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
      txHash: outcome.transaction.hash,
      signerId,
      recipientId: targetRecipient,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
