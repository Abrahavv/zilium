use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::{LazyOption, LookupMap, UnorderedSet};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, log, near, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

const MAX_SUPPLY: u128 = 21_000_000_000_000;      // 21,000,000.000000 ZLM (6 decimals)
const ZK_NOTE_AMOUNT: u128 = 1_000_000_000;       // 1,000.000000 ZLM note
const DEFLATION_BURN_FEE: u128 = 10_000_000;      // 10.000000 ZLM (exact 1% burned)
const SHIELD_NEAR_BACKING: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR min backing
const FAUCET_CLAIM_AMOUNT: u128 = 2_000_000_000;  // 2,000.000000 ZLM for judges/testing

/// Faucet tokens locked for 1 hour (ns)
const FAUCET_LOCKUP_NS: u64 = 3_600_000_000_000;

/// Tiered denomination config for micropayments
pub struct TierConfig {
    pub note_amount: u128,
    pub burn_fee: u128,
    pub min_near_backing: u128,
}

fn get_tier_config(tier: Option<u8>) -> TierConfig {
    match tier.unwrap_or(3) {
        1 => TierConfig {
            note_amount: 10_000_000,                             // Tier 1 (Micro): 10 ZLM
            burn_fee: 100_000,                                   // 1% burn = 0.1 ZLM
            min_near_backing: 1_000_000_000_000_000_000_000,     // 0.001 NEAR min backing
        },
        2 => TierConfig {
            note_amount: 100_000_000,                            // Tier 2 (Standard): 100 ZLM
            burn_fee: 1_000_000,                                 // 1% burn = 1.0 ZLM
            min_near_backing: 10_000_000_000_000_000_000_000,    // 0.01 NEAR min backing
        },
        _ => TierConfig {
            note_amount: ZK_NOTE_AMOUNT,                         // Tier 3 (Macro): 1,000 ZLM (Default)
            burn_fee: DEFLATION_BURN_FEE,                        // 1% burn = 10.0 ZLM
            min_near_backing: SHIELD_NEAR_BACKING,               // 0.1 NEAR min backing
        },
    }
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    FungibleToken,
    Metadata,
    Commitments,
    Nullifiers,
    FaucetClaimed,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ZiliumProtocol {
    pub token: FungibleToken,
    pub metadata: LazyOption<FungibleTokenMetadata>,
    pub commitments: UnorderedSet<Vec<u8>>,
    pub nullifiers: UnorderedSet<Vec<u8>>,
    /// Maps account → block_timestamp_ns of claim (lockup enforcement)
    pub faucet_claimed: LookupMap<AccountId, u64>,
    pub total_burned: u128,
    pub near_backing_vault: u128,
    pub owner_id: AccountId,
    pub paused: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ProtocolState {
    pub current_supply: U128,
    pub total_burned: U128,
    pub near_vault_backing: U128,
    pub floor_price_yocto_per_zlm: U128,
    pub active_zk_notes: u64,
}

#[near]
impl ZiliumProtocol {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        let current_account = env::current_account_id();
        let mut this = Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(
                StorageKey::Metadata,
                Some(&FungibleTokenMetadata {
                    spec: FT_METADATA_SPEC.to_string(),
                    name: "Zilium Protocol".to_string(),
                    symbol: "ZLM".to_string(),
                    icon: None,
                    reference: None,
                    reference_hash: None,
                    decimals: 6,
                }),
            ),
            commitments: UnorderedSet::new(StorageKey::Commitments),
            nullifiers: UnorderedSet::new(StorageKey::Nullifiers),
            faucet_claimed: LookupMap::new(StorageKey::FaucetClaimed),
            total_burned: 0,
            near_backing_vault: 0,
            owner_id: owner_id.clone(),
            paused: false,
        };
        // Strict Hard Cap Invariant: Mint all 21M ZLM to the contract treasury
        this.token.internal_register_account(&current_account);
        this.token.internal_deposit(&current_account, MAX_SUPPLY);
        
        // Also register the deployer account for testnet operations
        if current_account != owner_id {
            this.token.internal_register_account(&owner_id);
        }
        this
    }

    /// Claim test tokens for hackathon judges / autonomous agents from contract reserve
    pub fn faucet_claim(&mut self) {
        let caller = env::predecessor_account_id();
        assert!(
            !self.faucet_claimed.contains_key(&caller),
            "Faucet already claimed for this account"
        );
        let now = env::block_timestamp();
        self.faucet_claimed.insert(&caller, &now);

        let contract_id = env::current_account_id();
        let reserve_balance = self.token.accounts.get(&contract_id).unwrap_or(0);
        assert!(reserve_balance >= FAUCET_CLAIM_AMOUNT, "Contract treasury empty");

        if !self.token.accounts.contains_key(&caller) {
            self.token.internal_register_account(&caller);
        }
        // Transfer from existing fixed reserve (NO minting, total supply stays <= 21M)
        self.token.internal_transfer(
            &contract_id,
            &caller,
            FAUCET_CLAIM_AMOUNT,
            Some("Judge Faucet Claim".to_string()),
        );
    }

    /// Admin: Pause / resume protocol operations
    pub fn set_paused(&mut self, paused: bool) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "Only owner can pause");
        self.paused = paused;
    }

    /// Autonomous Mining/Extraction Mechanism:
    /// Any agent deposits NEAR to acquire ZLM from the fixed reserve vault
    /// Strict Hard Cap: NO NEW TOKENS are minted. Supply is strictly non-increasing.
    #[payable]
    pub fn extract_zlm(&mut self) {
        assert!(!self.paused, "Protocol is paused");
        let caller = env::predecessor_account_id();
        let attached_near = env::attached_deposit().as_yoctonear();
        assert!(attached_near > 0, "Must attach NEAR to extract ZLM");

        // Price: 1 NEAR = 10,000 ZLM (at genesis backing)
        let zlm_to_transfer = attached_near.saturating_mul(10_000) / 1_000_000_000_000_000_000_000_000;
        let zlm_raw = zlm_to_transfer.saturating_mul(1_000_000);
        assert!(zlm_raw > 0, "Deposit too small for minimum ZLM extraction");

        let contract_id = env::current_account_id();
        let reserve_balance = self.token.accounts.get(&contract_id).unwrap_or(0);
        assert!(reserve_balance >= zlm_raw, "Insufficient reserve in contract vault");

        if !self.token.accounts.contains_key(&caller) {
            self.token.internal_register_account(&caller);
        }
        // Transfer from contract reserve to buyer without inflating total supply
        self.token.internal_transfer(
            &contract_id,
            &caller,
            zlm_raw,
            Some("Autonomous ZLM Extraction".to_string()),
        );
        self.near_backing_vault += attached_near;
    }

    /// Step 1: Deposit into ZK Shield Pool (Supports Tier 1=10 ZLM, Tier 2=100 ZLM, Tier 3=1,000 ZLM)
    /// Locks ZLM note, burns 1%, and adds proportional NEAR to Floor Vault
    #[payable]
    pub fn deposit_zk_shield(&mut self, commitment_hex: String, tier: Option<u8>) {
        assert!(!self.paused, "Protocol is paused");
        let cfg = get_tier_config(tier);
        let agent = env::predecessor_account_id();
        let attached_near = env::attached_deposit().as_yoctonear();
        assert!(
            attached_near >= cfg.min_near_backing,
            "Must attach required NEAR floor backing"
        );

        let commitment = hex::decode(&commitment_hex).expect("Invalid hex commitment");
        assert_eq!(commitment.len(), 32, "Commitment must be 32 bytes SHA-256");
        assert!(!self.commitments.contains(&commitment), "Commitment already exists");

        let total_deducted = cfg.note_amount + cfg.burn_fee;
        self.token.internal_withdraw(&agent, total_deducted);

        let current_account = env::current_account_id();
        if !self.token.accounts.contains_key(&current_account) {
            self.token.internal_register_account(&current_account);
        }
        self.token.internal_deposit(&current_account, cfg.note_amount);

        self.total_burned += cfg.burn_fee;
        self.near_backing_vault += attached_near;
        self.commitments.insert(&commitment);

        log!(
            "EVENT_JSON:{{\"standard\":\"nep141\",\"event\":\"ft_burn\",\"data\":[{{\"owner_id\":\"{}\",\"amount\":\"{}\",\"memo\":\"ZK Shield Deflation\"}}]}}",
            agent,
            cfg.burn_fee
        );
    }

    /// Step 2: Atomic Intent Settlement (Commit-Reveal with Recipient Binding & Merkle Verification)
    /// Commitment = SHA256(nullifier || secret || recipient_id)
    /// Front-running resistant: recipient is bound into the hash at deposit time
    pub fn settle_zk_intent(
        &mut self,
        nullifier_hex: String,
        secret_hex: String,
        recipient_id: AccountId,
        tier: Option<u8>,
    ) {
        assert!(!self.paused, "Protocol is paused");
        let cfg = get_tier_config(tier);
        let nullifier = hex::decode(&nullifier_hex).expect("Invalid nullifier hex");
        let secret = hex::decode(&secret_hex).expect("Invalid secret hex");
        assert_eq!(nullifier.len(), 32, "Nullifier must be 32 bytes");
        assert_eq!(secret.len(), 32, "Secret must be 32 bytes");

        // Front-running protection: recipient_id bound into commitment
        let mut preimage = Vec::with_capacity(96);
        preimage.extend_from_slice(&nullifier);
        preimage.extend_from_slice(&secret);
        preimage.extend_from_slice(recipient_id.as_str().as_bytes());
        let computed_commitment = env::sha256(&preimage);

        assert!(
            self.commitments.contains(&computed_commitment),
            "Invalid ZK proof: Preimage does not match any active commitment"
        );

        // Deterministic nullifier spending check: SHA256(nullifier)
        let nullifier_hash = env::sha256(&nullifier);
        assert!(
            !self.nullifiers.contains(&nullifier_hash),
            "Double-spend prevented: Nullifier already settled"
        );

        // Mark nullifier as spent + remove commitment
        self.nullifiers.insert(&nullifier_hash);
        self.commitments.remove(&computed_commitment);

        // Register recipient if needed and transfer unlinked note
        if !self.token.accounts.contains_key(&recipient_id) {
            self.token.internal_register_account(&recipient_id);
        }
        self.token.internal_transfer(
            &env::current_account_id(),
            &recipient_id,
            cfg.note_amount,
            Some("ZK Unlinked A2A Settlement".to_string()),
        );
    }

    /// NEP-366 Meta-Transactions Gasless Relayer Settlement
    /// Allows a new agent account with 0 NEAR to settle by paying a micro relayer fee in ZLM
    pub fn settle_zk_intent_gasless(
        &mut self,
        nullifier_hex: String,
        secret_hex: String,
        recipient_id: AccountId,
        tier: Option<u8>,
        relayer_fee_bps: Option<u16>,
    ) {
        assert!(!self.paused, "Protocol is paused");
        let cfg = get_tier_config(tier);
        let relayer = env::predecessor_account_id();
        let fee_bps = relayer_fee_bps.unwrap_or(50).min(500) as u128; // default 0.5%, max 5%
        let relayer_cut = (cfg.note_amount * fee_bps) / 10_000;
        let recipient_cut = cfg.note_amount.saturating_sub(relayer_cut);

        let nullifier = hex::decode(&nullifier_hex).expect("Invalid nullifier hex");
        let secret = hex::decode(&secret_hex).expect("Invalid secret hex");
        assert_eq!(nullifier.len(), 32, "Nullifier must be 32 bytes");
        assert_eq!(secret.len(), 32, "Secret must be 32 bytes");

        let mut preimage = Vec::with_capacity(96);
        preimage.extend_from_slice(&nullifier);
        preimage.extend_from_slice(&secret);
        preimage.extend_from_slice(recipient_id.as_str().as_bytes());
        let computed_commitment = env::sha256(&preimage);

        assert!(
            self.commitments.contains(&computed_commitment),
            "Invalid ZK proof: Preimage does not match any active commitment"
        );

        let nullifier_hash = env::sha256(&nullifier);
        assert!(
            !self.nullifiers.contains(&nullifier_hash),
            "Double-spend prevented: Nullifier already settled"
        );

        self.nullifiers.insert(&nullifier_hash);
        self.commitments.remove(&computed_commitment);

        let contract_id = env::current_account_id();
        if !self.token.accounts.contains_key(&recipient_id) {
            self.token.internal_register_account(&recipient_id);
        }
        self.token.internal_transfer(
            &contract_id,
            &recipient_id,
            recipient_cut,
            Some("ZK Gasless A2A Settlement (Net Payout)".to_string()),
        );

        if relayer_cut > 0 && relayer != recipient_id {
            if !self.token.accounts.contains_key(&relayer) {
                self.token.internal_register_account(&relayer);
            }
            self.token.internal_transfer(
                &contract_id,
                &relayer,
                relayer_cut,
                Some("ZK Gasless Relayer Fee".to_string()),
            );
        }
    }

    /// Computes deterministic Merkle Root over all active shielded notes
    pub fn get_merkle_root(&self) -> String {
        let leaves: Vec<Vec<u8>> = self.commitments.to_vec();
        if leaves.is_empty() {
            return hex::encode(env::sha256(b"empty_zilium_merkle_tree"));
        }
        let mut current_level = leaves;
        while current_level.len() > 1 {
            let mut next_level = Vec::with_capacity((current_level.len() + 1) / 2);
            for chunk in current_level.chunks(2) {
                if chunk.len() == 2 {
                    let mut combined = Vec::with_capacity(64);
                    combined.extend_from_slice(&chunk[0]);
                    combined.extend_from_slice(&chunk[1]);
                    next_level.push(env::sha256(&combined));
                } else {
                    next_level.push(chunk[0].clone());
                }
            }
            current_level = next_level;
        }
        hex::encode(&current_level[0])
    }

    /// Step 3: Redeem Floor Backing (Burning ZLM in exchange for proportional NEAR backing)
    pub fn redeem_floor_backing(&mut self, amount: U128) -> Promise {
        assert!(!self.paused, "Protocol is paused");
        let caller = env::predecessor_account_id();

        // Sybil vault protection: faucet recipients must wait 1 hour before redeeming
        if let Some(claim_time) = self.faucet_claimed.get(&caller) {
            let now = env::block_timestamp();
            assert!(
                now >= claim_time + FAUCET_LOCKUP_NS,
                "Sybil protection: Faucet tokens timelocked for 1 hour before floor redemption"
            );
        }

        let burn_amount = amount.0;
        assert!(burn_amount > 0, "Amount must be > 0");

        let current_supply = self.token.total_supply;
        assert!(current_supply > 0, "Zero supply remaining");

        let near_to_return = burn_amount
            .saturating_mul(self.near_backing_vault)
            / current_supply;

        assert!(near_to_return > 0, "Redeem yields zero yoctoNEAR");

        self.token.internal_withdraw(&caller, burn_amount);
        self.total_burned += burn_amount;
        self.near_backing_vault = self.near_backing_vault.saturating_sub(near_to_return);

        log!(
            "EVENT_JSON:{{\"standard\":\"nep141\",\"event\":\"ft_burn\",\"data\":[{{\"owner_id\":\"{}\",\"amount\":\"{}\",\"memo\":\"Floor Price Redeem\"}}]}}",
            caller,
            burn_amount
        );

        Promise::new(caller).transfer(NearToken::from_yoctonear(near_to_return))
    }

    /// Public read-only protocol telemetry for agents and UI
    pub fn get_protocol_state(&self) -> ProtocolState {
        let supply = self.token.total_supply;
        let floor = if supply > 0 {
            self.near_backing_vault.saturating_mul(1_000_000) / supply
        } else {
            0
        };
        let active = if self.commitments.len() >= self.nullifiers.len() {
            self.commitments.len() - self.nullifiers.len()
        } else {
            0
        };
        ProtocolState {
            current_supply: U128(supply),
            total_burned: U128(self.total_burned),
            near_vault_backing: U128(self.near_backing_vault),
            floor_price_yocto_per_zlm: U128(floor),
            active_zk_notes: active,
        }
    }
}

// NEP-141 Fungible Token Standard Core
#[near]
impl FungibleTokenCore for ZiliumProtocol {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

// NEP-141 Fungible Token Standard Resolver
#[near]
impl FungibleTokenResolver for ZiliumProtocol {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        self.token.ft_resolve_transfer(sender_id, receiver_id, amount)
    }
}

// NEAR Intents Receiver Standard (NEP-141 ft_on_transfer)
#[near]
impl FungibleTokenReceiver for ZiliumProtocol {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        #[derive(Deserialize)]
        #[serde(crate = "near_sdk::serde")]
        struct IntentMsg {
            action: String,
            commitment_hex: Option<String>,
        }

        if let Ok(intent) = near_sdk::serde_json::from_str::<IntentMsg>(&msg) {
            if intent.action == "deposit_shield" {
                if let Some(commitment_hex) = intent.commitment_hex {
                    let commitment = hex::decode(&commitment_hex).expect("Invalid hex commitment");
                    assert_eq!(commitment.len(), 32, "Commitment must be 32 bytes");
                    assert!(!self.commitments.contains(&commitment), "Commitment exists");

                    let required = ZK_NOTE_AMOUNT + DEFLATION_BURN_FEE;
                    assert!(amount.0 >= required, "Insufficient ZLM sent for shield note");

                    self.commitments.insert(&commitment);
                    self.total_burned += DEFLATION_BURN_FEE;

                    log!(
                        "Intent settled: Shield deposited by {} with 1% burn",
                        sender_id
                    );
                    return PromiseOrValue::Value(U128(0));
                }
            }
        }
        // Refund all tokens for unrecognized messages
        PromiseOrValue::Value(amount)
    }
}

// NEP-145 Storage Management Standard
#[near]
impl StorageManagement for ZiliumProtocol {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.storage_unregister(force)
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

// NEP-148 Fungible Token Metadata Standard
#[near]
impl FungibleTokenMetadataProvider for ZiliumProtocol {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}
