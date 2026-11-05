// A customer agent pays the borrower agent's x402 endpoint once, with no human approving.
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { required } from "../src/lib/env.js";
import { hashscanTx } from "../src/lib/hedera.js";

const network = required("HEDERA_NETWORK");
const signer = createClientHederaSigner(
  required("HEDERA_CUSTOMER_ID"),
  PrivateKey.fromStringECDSA(required("HEDERA_CUSTOMER_KEY")),
  { network },
);

const client = new x402Client();
client.register("hedera:*", new ExactHederaScheme(signer));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const httpClient = new x402HTTPClient(client);

const url = `${required("GATEWAY_URL")}/translate`;
console.log(`Paying ${url} ...`);
const started = performance.now();
const response = await fetchWithPayment(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ text: "Hello, how are you?", to: "hi" }),
});
const result = await httpClient.processResponse(response);
console.dir(result, { depth: null });
console.log(`Done in ${((performance.now() - started) / 1000).toFixed(2)}s, HTTP ${response.status}`);

const txId = JSON.stringify(result).match(/0\.0\.\d+@\d+\.\d+/)?.[0];
if (txId) console.log(`Settlement: ${hashscanTx(txId)}`);
