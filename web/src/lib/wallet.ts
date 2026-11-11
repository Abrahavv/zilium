import type { WalletSelector } from "@near-wallet-selector/core";
import type { WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { CONTRACT_ID } from "./near-zk";

let selectorPromise: Promise<{ selector: WalletSelector; modal: WalletSelectorModal }> | null = null;

export async function getWalletSelector(): Promise<{ selector: WalletSelector; modal: WalletSelectorModal } | null> {
  if (typeof window === "undefined") return null;

  if (!selectorPromise) {
    selectorPromise = (async () => {
      const { setupWalletSelector } = await import("@near-wallet-selector/core");
      const { setupModal } = await import("@near-wallet-selector/modal-ui");
      const { setupMyNearWallet } = await import("@near-wallet-selector/my-near-wallet");
      const { setupMeteorWallet } = await import("@near-wallet-selector/meteor-wallet");

      const selector = await setupWalletSelector({
        network: {
          networkId: "testnet",
          nodeUrl: "https://test.rpc.fastnear.com",
          helperUrl: "https://helper.testnet.near.org",
          explorerUrl: "https://testnet.nearblocks.io",
          indexerUrl: "https://test.api.fastnear.com/v0",
        },
        modules: [
          setupMyNearWallet(),
          setupMeteorWallet(),
        ],
      });

      const modal = setupModal(selector, {
        contractId: CONTRACT_ID,
      });

      return { selector, modal };
    })();
  }

  return selectorPromise;
}

