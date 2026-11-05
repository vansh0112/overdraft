// Creates the demo's extra Hedera testnet accounts from the operator account, so only one portal
// sign-up is needed. Each account gets a fresh ECDSA key generated on this machine, a little test
// HBAR, and automatic token association (so it can receive USDC without a separate sign-up step).
// IDs and keys are written to the root .env and never printed.
//
//   npm run create-accounts -- CUSTOMER            # creates HEDERA_CUSTOMER_ID / HEDERA_CUSTOMER_KEY
//   npm run create-accounts -- CUSTOMER POOL ...   # several at once
import { AccountCreateTransaction, Hbar, PrivateKey } from "@hiero-ledger/sdk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { optional } from "../src/lib/env.js";
import { hashscanTx, operatorClient } from "../src/lib/hedera.js";

const ENV = new URL("../../.env", import.meta.url);
const names = process.argv.slice(2).map((n) => n.toUpperCase());
if (!names.length) {
  console.error("Usage: npm run create-accounts -- CUSTOMER [POOL ...]");
  process.exit(1);
}

function setEnv(entries: Record<string, string>): void {
  let text = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(ENV, text);
}

const client = operatorClient();
for (const name of names) {
  const idKey = `HEDERA_${name}_ID`;
  if (optional(idKey) && !optional(idKey)!.endsWith(".0000000")) {
    console.log(`- ${name}: already set (${optional(idKey)}), skipped`);
    continue;
  }
  const key = PrivateKey.generateECDSA();
  const response = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(key)
    .setInitialBalance(new Hbar(5))
    .setMaxAutomaticTokenAssociations(10)
    .execute(client);
  const receipt = await response.getReceipt(client);
  const accountId = receipt.accountId!.toString();
  setEnv({ [idKey]: accountId, [`HEDERA_${name}_KEY`]: `0x${key.toStringRaw()}` });
  console.log(`- ${name}: ${accountId} (key saved to .env) ${hashscanTx(response.transactionId.toString())}`);
}
client.close();
