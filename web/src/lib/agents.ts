/** Short names for the demo agents on Hedera testnet; any other agent ID is shown by number only. */
export const AGENT_LABELS: Record<number, string> = {
  140: "Translation agent",
  141: "Breach test",
  142: "Fake earnings test",
  143: "Payment redirect test",
};

/** The demo agents' short names, else the name in the agent's ERC-8004 registration, else "Agent". */
export function agentLabel(agentId: number, name?: string | null): string {
  return AGENT_LABELS[agentId] ?? name ?? "Agent";
}
