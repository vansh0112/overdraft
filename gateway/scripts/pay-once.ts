// One customer agent pays the agent's x402 endpoint once, with no human approving.
import { hederaAccounts, optional, required } from "../src/lib/env.js";
import { hashscanTx } from "../src/lib/hedera.js";
import { Payer } from "../src/lib/payer.js";

const customer = hederaAccounts("CUSTOMER")[0];
if (!customer) {
  console.error("No customer configured. Run: npm run create-accounts -- CUSTOMER");
  process.exit(1);
}
const priceUsd = Number(required("PRICE_ATOMIC")) / 1_000_000;
const payer = new Payer(customer, required("HEDERA_NETWORK"), Number(optional("CUSTOMER_MAX_PAYMENT_USD") ?? "0.05"), priceUsd);
const result = await payer.post(`${required("GATEWAY_URL")}/translate`, { text: "Hello, how are you?", to: "hi" }, priceUsd);
console.dir(result, { depth: null });
if (result.transaction) console.log(`Settlement: ${hashscanTx(result.transaction)}`);
