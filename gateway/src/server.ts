// x402 payment gateway for the borrower agent's paid service on Hedera testnet.
// Customers pay USDC per request; payTo is the agent's IncomeSplitter contract, so income lands there.
// After the facilitator verifies a payment, the request is forwarded to the Python agent. The middleware
// only settles when this handler returns a status below 400, so customers pay only for successful work.
//
// It also serves the sandbox: /sandbox/<agent ID>/translate, a paid endpoint any tester can give their agent
// when enrolling, with simulated work. Its payTo comes from the console API: the agent's splitter once it is
// enrolled, its owner's account before that. The console API is the sandbox's public front door.
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
const usdc = required("USDC_TOKEN_ID");
const consoleUrl = optional("CONSOLE_INTERNAL_URL") ?? `http://127.0.0.1:${optional("API_PORT") ?? "8000"}`;

type SandboxTerms = { payTo: string; enrolled: boolean; at: number };
const sandboxTerms = new Map<string, SandboxTerms>();

class SandboxError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Who a sandbox agent's customers pay right now, kept for 15 seconds. */
async function sandboxPayTo(agentId: string): Promise<SandboxTerms> {
  const known = sandboxTerms.get(agentId);
  if (known && Date.now() - known.at < 15_000) return known;
  const response = await fetch(`${consoleUrl}/api/sandbox/${agentId}/pay-to`, { signal: AbortSignal.timeout(20_000) });
  const body = (await response.json().catch(() => ({}))) as { payTo?: string; enrolled?: boolean; detail?: string };
  if (!response.ok || !body.payTo) throw new SandboxError(response.status === 404 ? 404 : 502, body.detail ?? "the sandbox can't look this agent up right now");
  const terms = { payTo: body.payTo, enrolled: Boolean(body.enrolled), at: Date.now() };
  sandboxTerms.set(agentId, terms);
  return terms;
}

const agentIdOf = (path: string) => path.split("/")[2] ?? "";

const app = express();
app.use(express.json({ limit: "16kb" }));

// Before payment: the agent must exist and its payTo be known, or the caller gets a plain reason why not.
app.use("/sandbox/:agentId/translate", async (req, res, next) => {
  if (!/^\d{1,9}$/.test(req.params.agentId)) {
    res.status(404).json({ error: "agent IDs are numbers" });
    return;
  }
  try {
    res.locals.sandbox = await sandboxPayTo(req.params.agentId);
    next();
  } catch (error) {
    res.status(error instanceof SandboxError ? error.status : 502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.use(
  paymentMiddleware(
    {
      "POST /translate": {
        accepts: [{ scheme: "exact", price: { amount: price, asset }, network, payTo }],
        description: "Translate text between English and Hindi",
        mimeType: "application/json",
      },
      "POST /sandbox/:agentId/translate": {
        accepts: [{ scheme: "exact", price: { amount: price, asset: usdc }, network, payTo: async (context) => (await sandboxPayTo(agentIdOf(context.path))).payTo }],
        description: "Overdraft sandbox: a test agent's paid endpoint (simulated work)",
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

app.post("/sandbox/:agentId/translate", (req, res) => {
  const text = String(req.body?.text ?? "").slice(0, 500);
  res.json({ agentId: Number(req.params.agentId), translation: `[simulated] ${text}`, simulated: true, paidTo: res.locals.sandbox?.payTo });
});

app.get("/sandbox/:agentId/translate", (req, res) => {
  const terms = res.locals.sandbox as SandboxTerms;
  res.json({
    what: "Overdraft sandbox: a paid x402 endpoint for testing. Use this URL as your agent's endpoint when you enrol.",
    agentId: Number(req.params.agentId),
    price: { amount: price, asset: usdc, network, usd: Number(price) / 1_000_000 },
    payTo: terms.payTo,
    paysIncomeContract: terms.enrolled,
    use: "POST JSON {\"text\": \"...\"} with an x402 payment; an unpaid request gets 402 with the payment terms.",
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, payTo, network, price, asset, agentUrl });
});

app.listen(port, () => {
  console.log(`x402 gateway on http://localhost:${port} -> agent ${agentUrl}`);
  console.log(`Price ${price} atomic ${asset} on ${network}, payTo ${payTo}`);
});
