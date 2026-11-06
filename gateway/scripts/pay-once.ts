// One customer agent hires an agent once, with no human approving: it finds the agent's x402 endpoint on the
// agent's ERC-8004 ID card, then pays it.
//
//   npm run pay-once              # the demo agent (AGENT_CREDIT_ID)
//   npm run pay-once -- 165       # any agent whose ID card lists an x402 endpoint
import { discoverEndpoint } from "../src/lib/discovery.js";
import { hederaAccounts, optional, required } from "../src/lib/env.js";
import { hashscanTx } from "../src/lib/hedera.js";
import { Payer } from "../src/lib/payer.js";

const customer = hederaAccounts("CUSTOMER")[0];
if (!customer) {
  console.error("No customer configured. Run: npm run create-accounts -- CUSTOMER");
  process.exit(1);
}
const demoAgent = Number(required("AGENT_CREDIT_ID"));
const agentId = Number(process.argv[2] ?? demoAgent);
// Only the demo agent, whose endpoint this deployment runs, may fall back to the configured URL.
const found = await discoverEndpoint(agentId, agentId === demoAgent ? `${required("GATEWAY_URL")}/translate` : undefined);
console.log(`Agent #${agentId}: paying ${found.url} (from ${found.source === "card" ? "its ERC-8004 ID card" : "the configured URL"})`);

const priceUsd = Number(required("PRICE_ATOMIC")) / 1_000_000;
const payer = new Payer(customer, required("HEDERA_NETWORK"), Number(optional("CUSTOMER_MAX_PAYMENT_USD") ?? "0.05"), priceUsd);
const result = await payer.post(found.url, { text: "Hello, how are you?", to: "hi" }, priceUsd);
console.dir(result, { depth: null });
if (result.transaction) console.log(`Settlement: ${hashscanTx(result.transaction)}`);
