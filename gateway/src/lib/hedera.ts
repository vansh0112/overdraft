import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";
import { required } from "./env.js";

export function operatorClient(): Client {
  return Client.forTestnet().setOperator(
    AccountId.fromString(required("HEDERA_OPERATOR_ID")),
    PrivateKey.fromStringECDSA(required("HEDERA_OPERATOR_KEY")),
  );
}

export function hashscanTx(txId: string): string {
  return `https://hashscan.io/testnet/transaction/${txId}`;
}
