use near_sdk::{env, near};

/// BN254 base field prime p
const BN254_P_LE: [u8; 32] = [71, 253, 124, 216, 22, 140, 32, 60, 141, 202, 113, 104, 145, 106, 129, 151, 93, 88, 129, 129, 182, 69, 80, 184, 41, 160, 49, 225, 114, 78, 100, 48];

const VK_ALPHA_G1: [u8; 64] = [255, 0, 153, 37, 87, 75, 137, 63, 49, 109, 180, 119, 219, 131, 138, 72, 41, 33, 162, 196, 122, 145, 243, 147, 118, 210, 15, 155, 101, 183, 21, 14, 206, 209, 10, 89, 108, 9, 158, 99, 192, 247, 111, 118, 186, 222, 114, 179, 181, 188, 17, 102, 135, 142, 210, 213, 96, 126, 65, 35, 117, 15, 175, 8];
const VK_BETA_G2: [u8; 128] = [238, 225, 16, 31, 240, 77, 2, 212, 144, 126, 24, 159, 117, 134, 40, 194, 141, 126, 57, 236, 76, 41, 194, 125, 88, 162, 185, 147, 198, 31, 171, 43, 228, 69, 46, 204, 228, 235, 244, 40, 40, 213, 200, 238, 176, 187, 77, 49, 28, 101, 21, 56, 126, 10, 153, 160, 68, 40, 105, 204, 9, 75, 42, 43, 141, 52, 157, 245, 27, 97, 216, 204, 149, 193, 165, 190, 149, 230, 56, 234, 151, 163, 1, 253, 40, 73, 89, 186, 199, 69, 202, 232, 122, 150, 24, 24, 50, 159, 102, 207, 117, 208, 228, 94, 89, 142, 199, 140, 190, 101, 46, 51, 25, 180, 209, 242, 32, 252, 7, 32, 81, 129, 22, 122, 0, 200, 178, 12];
const VK_GAMMA_G2: [u8; 128] = [237, 246, 146, 217, 92, 189, 222, 70, 221, 218, 94, 247, 212, 34, 67, 103, 121, 68, 92, 94, 102, 0, 106, 66, 118, 30, 31, 18, 239, 222, 0, 24, 194, 18, 243, 174, 183, 133, 228, 151, 18, 231, 169, 53, 51, 73, 170, 241, 37, 93, 251, 49, 183, 191, 96, 114, 58, 72, 13, 146, 147, 147, 142, 25, 170, 125, 250, 102, 1, 204, 230, 76, 123, 211, 67, 12, 105, 231, 209, 227, 143, 64, 203, 141, 128, 113, 171, 74, 235, 109, 140, 219, 165, 94, 200, 18, 91, 151, 34, 209, 220, 218, 172, 85, 243, 142, 179, 112, 51, 49, 75, 188, 149, 51, 12, 105, 173, 153, 158, 236, 117, 240, 95, 88, 208, 137, 6, 9];
const VK_DELTA_G2: [u8; 128] = [33, 185, 125, 219, 43, 40, 117, 30, 210, 82, 175, 215, 98, 215, 113, 149, 157, 172, 243, 191, 45, 218, 237, 165, 230, 187, 90, 117, 192, 53, 65, 28, 175, 167, 134, 109, 114, 231, 33, 207, 186, 223, 182, 37, 254, 5, 108, 26, 201, 237, 52, 90, 70, 243, 25, 254, 106, 241, 153, 57, 152, 172, 51, 35, 161, 54, 103, 20, 204, 145, 228, 244, 7, 21, 202, 94, 86, 139, 228, 112, 254, 184, 85, 161, 38, 198, 155, 129, 166, 180, 86, 7, 8, 178, 208, 36, 37, 199, 66, 13, 14, 142, 111, 226, 133, 130, 146, 126, 114, 93, 131, 224, 176, 145, 1, 180, 107, 28, 131, 11, 189, 63, 157, 160, 29, 33, 52, 24];

const VK_IC_0: [u8; 64] = [229, 15, 89, 28, 102, 131, 169, 181, 118, 167, 224, 117, 187, 225, 72, 18, 46, 7, 39, 0, 169, 203, 7, 172, 25, 156, 209, 91, 99, 155, 203, 18, 180, 246, 83, 17, 148, 17, 175, 235, 98, 194, 28, 77, 221, 55, 184, 226, 148, 179, 119, 95, 43, 36, 153, 133, 243, 153, 31, 1, 83, 181, 89, 31];
const VK_IC_1: [u8; 64] = [165, 186, 252, 10, 198, 123, 214, 49, 139, 212, 144, 89, 3, 56, 110, 192, 72, 253, 36, 209, 153, 214, 175, 149, 211, 85, 5, 123, 233, 134, 127, 22, 100, 38, 167, 143, 216, 98, 211, 22, 149, 22, 172, 13, 84, 47, 200, 73, 112, 133, 247, 45, 92, 175, 155, 7, 186, 198, 184, 35, 24, 255, 253, 36];
const VK_IC_2: [u8; 64] = [139, 201, 23, 128, 27, 105, 81, 113, 200, 30, 130, 124, 222, 212, 31, 142, 156, 0, 148, 17, 37, 206, 193, 234, 160, 193, 59, 79, 123, 137, 112, 13, 209, 2, 132, 203, 15, 96, 219, 255, 67, 49, 133, 26, 97, 190, 92, 63, 174, 158, 114, 135, 235, 56, 4, 222, 211, 180, 69, 87, 182, 249, 134, 41];
const VK_IC_3: [u8; 64] = [141, 123, 145, 102, 247, 210, 194, 57, 64, 161, 104, 54, 17, 212, 102, 87, 84, 186, 4, 130, 211, 148, 64, 224, 95, 93, 204, 78, 21, 213, 216, 18, 54, 19, 213, 113, 193, 71, 38, 216, 117, 97, 239, 227, 133, 191, 220, 183, 104, 99, 2, 25, 101, 53, 249, 133, 165, 93, 17, 91, 64, 154, 164, 24];

#[near(serializers = [json])]
#[derive(Clone)]
pub struct Groth16Proof {
    /// G1 point A: 64 bytes little-endian (x_le || y_le)
    pub a_hex: String,
    /// G2 point B: 128 bytes little-endian (x_c0_le || x_c1_le || y_c0_le || y_c1_le)
    pub b_hex: String,
    /// G1 point C: 64 bytes little-endian (x_le || y_le)
    pub c_hex: String,
}

/// Negates a G1 point (x, y) -> (x, p - y) in little-endian BN254 base field
fn negate_g1_le(pt: &[u8; 64]) -> [u8; 64] {
    let mut out = [0u8; 64];
    out[0..32].copy_from_slice(&pt[0..32]);

    let is_zero = pt[32..64].iter().all(|&b| b == 0);
    if is_zero {
        return out;
    }

    let mut borrow: i16 = 0;
    for i in 0..32 {
        let diff = (BN254_P_LE[i] as i16) - (pt[32 + i] as i16) - borrow;
        if diff < 0 {
            out[32 + i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            out[32 + i] = diff as u8;
            borrow = 0;
        }
    }
    out
}

/// Verifies a Groth16 BN254 proof on NEAR using native runtime alt_bn128 host functions.
/// Public signals order (Circom outputs first, then public inputs):
/// [commitment_le, nullifier_hash_le, recipient_hash_le]
pub fn verify_groth16_bn254(proof: &Groth16Proof, public_signals_le: &[[u8; 32]; 3]) -> bool {
    let a_bytes = match hex::decode(&proof.a_hex) {
        Ok(b) if b.len() == 64 => b,
        _ => return false,
    };
    let b_bytes = match hex::decode(&proof.b_hex) {
        Ok(b) if b.len() == 128 => b,
        _ => return false,
    };
    let c_bytes = match hex::decode(&proof.c_hex) {
        Ok(b) if b.len() == 64 => b,
        _ => return false,
    };

    let mut a_arr = [0u8; 64];
    a_arr.copy_from_slice(&a_bytes);
    let neg_a = negate_g1_le(&a_arr);

    let mut multiexp_input = Vec::with_capacity(3 * 96);
    multiexp_input.extend_from_slice(&VK_IC_1);
    multiexp_input.extend_from_slice(&public_signals_le[0]);
    multiexp_input.extend_from_slice(&VK_IC_2);
    multiexp_input.extend_from_slice(&public_signals_le[1]);
    multiexp_input.extend_from_slice(&VK_IC_3);
    multiexp_input.extend_from_slice(&public_signals_le[2]);

    let linear_comb = env::alt_bn128_g1_multiexp(&multiexp_input);
    if linear_comb.len() != 64 {
        return false;
    }

    let mut sum_input = Vec::with_capacity(2 * 65);
    sum_input.push(0);
    sum_input.extend_from_slice(&VK_IC_0);
    sum_input.push(0);
    sum_input.extend_from_slice(&linear_comb);

    let vk_x = env::alt_bn128_g1_sum(&sum_input);
    if vk_x.len() != 64 {
        return false;
    }

    let mut pairing_input = Vec::with_capacity(4 * 192);
    pairing_input.extend_from_slice(&neg_a);
    pairing_input.extend_from_slice(&b_bytes);

    pairing_input.extend_from_slice(&VK_ALPHA_G1);
    pairing_input.extend_from_slice(&VK_BETA_G2);

    pairing_input.extend_from_slice(&vk_x);
    pairing_input.extend_from_slice(&VK_GAMMA_G2);

    pairing_input.extend_from_slice(&c_bytes);
    pairing_input.extend_from_slice(&VK_DELTA_G2);

    env::alt_bn128_pairing_check(&pairing_input)
}
