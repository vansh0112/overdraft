// A customer agent that pays x402 endpoints on Hedera with no human approving, within spend controls:
// only recognised assets (Hedera USDC), at most MAX_PAYMENT per request, and a total budget per run.
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import type { HederaAccount } from "./env.js";

export type PaidResult = {
  payer: string;
  status: number;
  settled: boolean;
  transaction?: string;
  body?: unknown;
  error?: string;
  ms: number;
};

export class Payer {
  private readonly pay: typeof fetch;
  private readonly http: x402HTTPClient;
  private spentUsd = 0;

  constructor(
    readonly account: HederaAccount,
    network: string,
    private readonly maxPaymentUsd: number,
    private readonly budgetUsd: number,
  ) {
    const signer = createClientHederaSigner(account.id, PrivateKey.fromStringECDSA(account.key), { network });
    const client = new x402Client().setSpendControls({ maxAmountPerPayment: `$${maxPaymentUsd}` });
    client.register("hedera:*", new ExactHederaScheme(signer));
    this.pay = wrapFetchWithPayment(fetch, client);
    this.http = new x402HTTPClient(client);
  }

  async post(url: string, body: unknown, priceUsd: number): Promise<PaidResult> {
    const started = performance.now();
    if (this.spentUsd + priceUsd > this.budgetUsd + 1e-9) {
      return { payer: this.account.id, status: 0, settled: false, error: "budget exhausted", ms: 0 };
    }
    try {
      const response = await this.pay(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await this.http.processResponse(response)) as {
        paymentStatus?: string;
        body?: unknown;
        header?: { transaction?: string };
      };
      const settled = result.paymentStatus === "settled";
      if (settled) this.spentUsd += priceUsd;
      return {
        payer: this.account.id,
        status: response.status,
        settled,
        transaction: result.header?.transaction,
        body: result.body,
        ms: Math.round(performance.now() - started),
      };
    } catch (error) {
      return { payer: this.account.id, status: 0, settled: false, error: String(error), ms: Math.round(performance.now() - started) };
    }
  }
}
