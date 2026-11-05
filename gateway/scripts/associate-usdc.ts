// Associates USDC with every Hedera account configured in .env (HEDERA_<NAME>_ID / _KEY), so each can
// hold and send it. Hedera requires this before an account can receive an HTS token, including from
// Circle's faucet.
import { AccountId, PrivateKey, TokenAssociateTransaction, TokenId } from "@hiero-ledger/sdk";
import { hederaAccounts, required } from "../src/lib/env.js";
import { hashscanTx, operatorClient } from "../src/lib/hedera.js";

const usdc = TokenId.fromString(required("USDC_TOKEN_ID"));
const client = operatorClient();

for (const { name, id, key } of hederaAccounts()) {
  try {
    const tx = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(id))
      .setTokenIds([usdc])
      .freezeWith(client)
      .sign(PrivateKey.fromStringECDSA(key));
    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);
    console.log(`- ${name} ${id}: ${receipt.status.toString()} ${hashscanTx(response.transactionId.toString())}`);
  } catch (error) {
    const message = String((error as Error).message ?? error);
    console.log(message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT") ? `- ${name} ${id}: already associated` : `- ${name} ${id}: failed: ${message}`);
  }
}

client.close();
