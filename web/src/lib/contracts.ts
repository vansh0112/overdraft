"use client";

import { createPublicClient, decodeEventLog, http, parseAbi, zeroAddress, type Hash } from "viem";
import { hederaTestnet } from "viem/chains";
import type { EnrolConfig } from "./api";
import { walletClient } from "./wallet";

/** The parts of the ERC-8004 identity registry (an ERC-721) that enrolling uses. */
const IDENTITY_ABI = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "function setApprovalForAll(address operator, bool approved)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

const hedera = createPublicClient({ chain: hederaTestnet, transport: http() });

async function confirmed(hash: Hash) {
  const receipt = await hedera.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error("The transaction failed on Hedera.");
  return receipt;
}

/** A minimal agent registration file, stored on-chain as a data URI, so the ID carries the agent's name. */
export function registrationUri(name: string, description: string): string {
  const file = { type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1", name, description };
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  return `data:application/json;base64,${btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))}`;
}

/** Mints a new agent ID to the connected wallet and returns it. */
export async function registerAgent(config: EnrolConfig, uri: string): Promise<{ agentId: number; hash: Hash }> {
  const wallet = walletClient();
  const hash = await wallet.writeContract({ address: config.identityRegistry, abi: IDENTITY_ABI, functionName: "register", args: [uri] });
  const receipt = await confirmed(hash);
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.identityRegistry.toLowerCase()) continue;
    try {
      const event = decodeEventLog({ abi: IDENTITY_ABI, data: log.data, topics: log.topics });
      if (event.eventName === "Transfer" && event.args.from === zeroAddress) return { agentId: Number(event.args.tokenId), hash };
    } catch {
      // Not a Transfer event.
    }
  }
  throw new Error("The ID was registered, but its number couldn't be read. Refresh to see it.");
}

/** Lets the credit line hold the wallet's agent IDs while their agents owe money. */
export async function approveCollateral(config: EnrolConfig): Promise<Hash> {
  const wallet = walletClient();
  const hash = await wallet.writeContract({
    address: config.identityRegistry,
    abi: IDENTITY_ABI,
    functionName: "setApprovalForAll",
    args: [config.creditLine, true],
  });
  await confirmed(hash);
  return hash;
}

/** Signs a request the way the console API checks it (EIP-712, domain and types from the API). */
export async function signRequest(config: EnrolConfig, primaryType: "Enrol" | "CreditCheck", message: Record<string, unknown>) {
  const wallet = walletClient();
  return wallet.signTypedData({
    domain: config.domain,
    types: { [primaryType]: config.types[primaryType] },
    primaryType,
    message,
  });
}
