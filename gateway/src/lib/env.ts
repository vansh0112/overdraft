import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";

// One .env at the repo root is shared by the TypeScript gateway and the Python services.
config({ path: new URL("../../../.env", import.meta.url) });

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Missing ${name} in .env (see .env.example).`);
    process.exit(1);
  }
  return value;
}

export function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const DEPLOYMENTS = new URL("../../../deployments/hedera-testnet.json", import.meta.url);

/** The splitter's Hedera ID (0.0.x): the x402 payTo. Written by the Python deploy step. */
export function splitterContractId(): string {
  const fromFile = existsSync(DEPLOYMENTS) ? JSON.parse(readFileSync(DEPLOYMENTS, "utf8")).splitterContractId : undefined;
  const id = optional("SPLITTER_CONTRACT_ID") ?? fromFile;
  if (!id) {
    console.error("No splitter deployed yet. Run the Python deploy step first (see README).");
    process.exit(1);
  }
  return id;
}

export type HederaAccount = { name: string; id: string; key: string };

/** Every HEDERA_<NAME>_ID / HEDERA_<NAME>_KEY pair in .env, optionally only names starting with `prefix`. */
export function hederaAccounts(prefix = ""): HederaAccount[] {
  const accounts: HederaAccount[] = [];
  for (const [envName, value] of Object.entries(process.env)) {
    const match = /^HEDERA_([A-Z0-9]+)_ID$/.exec(envName);
    if (!match || !match[1].startsWith(prefix)) continue;
    const key = process.env[`HEDERA_${match[1]}_KEY`]?.trim();
    const id = value?.trim();
    if (id && key && !id.endsWith(".0000000")) accounts.push({ name: match[1], id, key });
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}
