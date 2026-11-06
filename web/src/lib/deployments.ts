/** Public addresses of the current deployment (mirrors deployments/hedera-testnet.json; update both on redeploy). */
export const DEPLOYMENTS = {
  /** The agent the live demo runs on (AGENT_CREDIT_ID in .env). */
  demoAgentId: 140,
  hedera: {
    network: "Hedera testnet (chain 296)",
    creditLine: { id: "0.0.11330129", evm: "0x16F7ffEa40A64632833dFfF6BE9b4E16C7F893EB" },
    splitter: { id: "0.0.11330131", evm: "0x8F2e28E5912191468A3D9B021F33DD29574A46D6" },
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    usdc: "0.0.429274",
    facilitator: "https://x402.org/facilitator",
  },
  zg: {
    network: "0G mainnet (chain 16661)",
    paymentVault: "0xA3b15Bd2aD18BFB6b5f92D8AA9F444Dd59d1cE32",
  },
  arkiv: {
    network: "Arkiv Rabdi testnet (chain 7794095)",
    bureau: "0x95cbCb85d4591eD0A71A34099689491f4892841A",
    schema: "overdraft.bureau",
  },
} as const;

export const hashscan = (id: string) => `https://hashscan.io/testnet/contract/${id}`;
