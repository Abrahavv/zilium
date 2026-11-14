pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

template ZiliumWithdraw() {
    // Private witness (NEVER revealed on-chain)
    signal input nullifier;
    signal input secret;

    // Public inputs verified on-chain via NEAR alt_bn128_pairing_check
    signal input recipientHash;
    signal output commitment;
    signal output nullifierHash;

    // 1. Commitment = Poseidon(nullifier, secret)
    component commitHasher = Poseidon(2);
    commitHasher.inputs[0] <== nullifier;
    commitHasher.inputs[1] <== secret;
    commitment <== commitHasher.out;

    // 2. Nullifier Hash = Poseidon(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;

    // 3. Recipient Binding constraint (prevents front-running / tampering)
    signal recipientSquare;
    recipientSquare <== recipientHash * recipientHash;
}

component main {public [recipientHash]} = ZiliumWithdraw();
