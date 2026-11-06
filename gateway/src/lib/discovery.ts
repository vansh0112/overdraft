// Finds an agent's paid x402 endpoint from its ERC-8004 registration file (its ID card), so a customer agent
// knows where to pay from the agent's on-chain identity instead of being handed a URL.
//
// The card is the agent's tokenURI on Hedera's official IdentityRegistry. Per ERC-8004 it lists the agent's
// endpoints under `services`; we look for the entry named "x402".
import { required } from "./env.js";

export const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
const TOKEN_URI_SELECTOR = "0xc87b56dd"; // tokenURI(uint256)
const MAX_CARD_BYTES = 64 * 1024;

export type AgentCard = {
  type?: string;
  name?: string;
  services?: { name?: string; endpoint?: string; version?: string }[];
  x402Support?: boolean;
};

export type Discovered = { url: string; source: "card" | "configured"; card: AgentCard | null };

/** The agent's tokenURI, read with a plain eth_call to the registry. */
export async function agentUri(agentId: number): Promise<string> {
  const data = TOKEN_URI_SELECTOR + BigInt(agentId).toString(16).padStart(64, "0");
  const response = await fetch(required("HEDERA_RPC_URL"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: IDENTITY_REGISTRY, data }, "latest"] }),
    signal: AbortSignal.timeout(15_000),
  });
  const { result, error } = (await response.json()) as { result?: string; error?: { message?: string } };
  if (!result || result === "0x") throw new Error(`agent ${agentId} has no ID card: ${error?.message ?? "empty result"}`);
  // ABI-encoded string: offset, length, then the bytes.
  const bytes = Buffer.from(result.slice(2), "hex");
  const length = Number(BigInt("0x" + bytes.subarray(32, 64).toString("hex")));
  return bytes.subarray(64, 64 + length).toString("utf8");
}

/** Reads the registration file a tokenURI points to: a data: URI or an https URL. Null if it isn't one. */
export async function readCard(uri: string): Promise<AgentCard | null> {
  let text: string;
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    const meta = uri.slice(5, comma);
    const payload = uri.slice(comma + 1);
    text = meta.endsWith(";base64") ? Buffer.from(payload, "base64").toString("utf8") : decodeURIComponent(payload);
  } else if (uri.startsWith("https://")) {
    const response = await fetch(uri, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    text = (await response.text()).slice(0, MAX_CARD_BYTES);
  } else {
    return null;
  }
  try {
    const card = JSON.parse(text) as AgentCard;
    return card?.type === REGISTRATION_TYPE ? card : null;
  } catch {
    return null;
  }
}

/** The card's x402 endpoint, if it lists one with an http(s) URL. */
export function x402Endpoint(card: AgentCard | null): string | null {
  const entry = card?.services?.find((s) => s.name?.toLowerCase() === "x402" && s.endpoint);
  if (!entry?.endpoint) return null;
  try {
    return ["https:", "http:"].includes(new URL(entry.endpoint).protocol) ? entry.endpoint : null;
  } catch {
    return null;
  }
}

/**
 * Where to pay agent `agentId`: the x402 endpoint on its ID card, else `fallback` (if given).
 * Throws when neither exists, so a customer never pays an address it can't account for.
 */
export async function discoverEndpoint(agentId: number, fallback?: string): Promise<Discovered> {
  let card: AgentCard | null = null;
  try {
    card = await readCard(await agentUri(agentId));
  } catch (error) {
    if (!fallback) throw error;
  }
  const url = x402Endpoint(card);
  if (url) return { url, source: "card", card };
  if (!fallback) throw new Error(`agent ${agentId}'s ID card lists no x402 endpoint`);
  return { url: fallback, source: "configured", card };
}
