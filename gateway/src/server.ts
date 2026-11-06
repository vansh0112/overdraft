// x402 payment gateway for the borrower agent's paid service on Hedera testnet.
// Customers pay USDC per request; payTo is the agent's IncomeSplitter contract, so income lands there.
// After the facilitator verifies a payment, the request is forwarded to the Python agent. The middleware
// only settles when this handler returns a status below 400, so customers pay only for successful work.
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { optional, required, splitterContractId } from "./lib/env.js";

const network = required("HEDERA_NETWORK") as "hedera:testnet";
const payTo = splitterContractId();
// PAYMENT_ASSET defaults to USDC. Set it to 0.0.0 to charge in HBAR (PRICE_ATOMIC is then in tinybars).
const asset = optional("PAYMENT_ASSET") ?? required("USDC_TOKEN_ID");
const price = required("PRICE_ATOMIC");
const port = Number(required("GATEWAY_PORT"));
const agentUrl = required("AGENT_INTERNAL_URL");
const agentToken = required("AGENT_INTERNAL_TOKEN");

const facilitator = new HTTPFacilitatorClient({ url: required("FACILITATOR_URL") });

const app = express();
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      "POST /translate": {
        accepts: [{ scheme: "exact", price: { amount: price, asset }, network, payTo }],
        description: "Translate text between English and Hindi",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitator)
      .register(network, new ExactHederaScheme())
      .onSettleFailure(async ({ error }) => {
        console.error(`${new Date().toISOString()} settlement failed: ${error.message}`);
      }),
  ),
);

app.post("/translate", async (req, res) => {
  try {
    const upstream = await fetch(`${agentUrl}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": agentToken },
      body: JSON.stringify(req.body ?? {}),
    });
    res.status(upstream.status).json(await upstream.json());
  } catch (error) {
    res.status(502).json({ error: "agent unavailable", detail: String(error) });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, payTo, network, price, asset, agentUrl });
});

app.listen(port, () => {
  console.log(`x402 gateway on http://localhost:${port} -> agent ${agentUrl}`);
  console.log(`Price ${price} atomic ${asset} on ${network}, payTo ${payTo}`);
});
