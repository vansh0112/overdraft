// Associates USDC with the operator and customer accounts so they can hold and send it.
// Hedera requires this before an account can receive an HTS token (including from Circle's faucet).
import { AccountId, PrivateKey, TokenAssociateTransaction, TokenId } from "@hiero-ledger/sdk";
import { optional, required } from "../src/lib/env.js";
import { hashscanTx, operatorClient } from "../src/lib/hedera.js";

const usdc = TokenId.fromString(required("USDC_TOKEN_ID"));
const client = operatorClient();

const accounts: { label: string; id?: string; key?: string }[] = [
  { label: "operator", id: optional("HEDERA_OPERATOR_ID"), key: optional("HEDERA_OPERATOR_KEY") },
  { label: "customer", id: optional("HEDERA_CUSTOMER_ID"), key: optional("HEDERA_CUSTOMER_KEY") },
];

for (const { label, id, key } of accounts) {
  if (!id || !key) {
    console.log(`- ${label}: skipped (not configured)`);
    continue;
  }
  try {
    const tx = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(id))
      .setTokenIds([usdc])
      .freezeWith(client)
      .sign(PrivateKey.fromStringECDSA(key));
    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`- ${label} ${id}: ${receipt.status.toString()} ${hashscanTx(response.transactionId.toString())}`);
  } catch (error) {
    const message = String((error as Error).message ?? error);
    if (message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) {
      console.log(`- ${label} ${id}: already associated`);
    } else {
      console.error(`- ${label} ${id}: failed: ${message}`);
    }
  }
}

client.close();
