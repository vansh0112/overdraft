// A rush of paid jobs: customer agents (every HEDERA_CUSTOMER*_ID/KEY in .env) pay the agent's x402
// endpoint at almost the same time, with no human approving.
//
//   npm run rush -- 10          # 10 paid jobs, spread round-robin over the customers
import { hederaAccounts, optional, required } from "../src/lib/env.js";
import { hashscanTx } from "../src/lib/hedera.js";
import { Payer } from "../src/lib/payer.js";

const jobs = Number(process.argv[2] ?? 10);
const network = required("HEDERA_NETWORK");
const url = `${required("GATEWAY_URL")}/translate`;
const priceUsd = Number(required("PRICE_ATOMIC")) / 1_000_000;
const maxPaymentUsd = Number(optional("CUSTOMER_MAX_PAYMENT_USD") ?? "0.05");
const budgetUsd = Number(optional("CUSTOMER_BUDGET_USD") ?? "0.50");
const staggerMs = Number(optional("RUSH_STAGGER_MS") ?? "150");

const customers = hederaAccounts("CUSTOMER");
if (!customers.length) {
  console.error("No customers configured. Run: npm run create-accounts -- CUSTOMER");
  process.exit(1);
}
const payers = customers.map((c) => new Payer(c, network, maxPaymentUsd, budgetUsd));
console.log(`Rush: ${jobs} paid jobs from ${payers.length} customers to ${url} ($${priceUsd} each, cap $${maxPaymentUsd}/payment)`);

const started = performance.now();
const results = await Promise.all(
  Array.from({ length: jobs }, async (_, i) => {
    await new Promise((resolve) => setTimeout(resolve, i * staggerMs));
    const result = await payers[i % payers.length].post(url, { text: `Rush job ${i + 1}: please translate this order note.`, to: "hi" }, priceUsd);
    const link = result.transaction ? hashscanTx(result.transaction) : result.error ?? "";
    console.log(`#${String(i + 1).padStart(2)} ${result.payer} HTTP ${result.status} ${result.settled ? "settled" : "not charged"} ${result.ms}ms ${link}`);
    return result;
  }),
);

const settled = results.filter((r) => r.settled).length;
console.log(
  `Done in ${((performance.now() - started) / 1000).toFixed(1)}s: ${settled}/${jobs} served and paid ` +
    `($${(settled * priceUsd).toFixed(2)}), ${jobs - settled} not charged.`,
);
