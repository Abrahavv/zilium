import * as snarkjs from "snarkjs";

export interface Groth16ProofPayload {
  a_hex: string;
  b_hex: string;
  c_hex: string;
}

export interface Groth16NoteBundle {
  nullifierDec: string;
  secretDec: string;
  commitmentHex: string;
  nullifierHashHex: string;
  recipientHashDec: string;
  proof: Groth16ProofPayload;
  publicSignals: string[];
}

export function decToLe32Hex(decStr: string): string {
  let n = BigInt(decStr);
  const mask = BigInt(0xff);
  const shift = BigInt(8);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(n & mask);
    n >>= shift;
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function g1ToLe64Hex(pt: string[]): string {
  return decToLe32Hex(pt[0]) + decToLe32Hex(pt[1]);
}

export function g2ToLe128Hex(pt: string[][]): string {
  return (
    decToLe32Hex(pt[0][0]) +
    decToLe32Hex(pt[0][1]) +
    decToLe32Hex(pt[1][0]) +
    decToLe32Hex(pt[1][1])
  );
}

export function leBytesToBigInt(bytes: Uint8Array): bigint {
  let n = BigInt(0);
  const shift = BigInt(8);
  for (let i = bytes.length - 1; i >= 0; i--) {
    n = (n << shift) | BigInt(bytes[i]);
  }
  return n;
}

export async function deriveRecipientFieldDec(recipientId: string): Promise<string> {
  const enc = new TextEncoder().encode(recipientId.trim());
  const buf = await globalThis.crypto.subtle.digest("SHA-256", enc);
  const digest = new Uint8Array(buf);
  // Mask top bits to 253-bit field element (< BN254 r) matching contract's recipient_hash_arr[31] &= 0x1F
  digest[31] &= 0x1f;
  return leBytesToBigInt(digest).toString();
}

export async function generateGroth16NoteAndProof(
  recipientId: string,
  wasmPath = "/zk/zilium_withdraw.wasm",
  zkeyPath = "/zk/zilium_withdraw_final.zkey"
): Promise<Groth16NoteBundle> {
  const randBytes = new Uint8Array(62);
  globalThis.crypto.getRandomValues(randBytes);

  const nullifierDec = leBytesToBigInt(randBytes.slice(0, 31)).toString();
  const secretDec = leBytesToBigInt(randBytes.slice(31, 62)).toString();
  const recipientHashDec = await deriveRecipientFieldDec(recipientId);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    {
      nullifier: nullifierDec,
      secret: secretDec,
      recipientHash: recipientHashDec,
    },
    wasmPath,
    zkeyPath
  );

  return {
    nullifierDec,
    secretDec,
    commitmentHex: decToLe32Hex(publicSignals[0]),
    nullifierHashHex: decToLe32Hex(publicSignals[1]),
    recipientHashDec,
    proof: {
      a_hex: g1ToLe64Hex(proof.pi_a),
      b_hex: g2ToLe128Hex(proof.pi_b),
      c_hex: g1ToLe64Hex(proof.pi_c),
    },
    publicSignals,
  };
}
