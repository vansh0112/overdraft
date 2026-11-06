"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** Opens any agent by ID, or any owner by wallet address or Hedera account. Everything shown is public on-chain. */
export function Lookup() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function open(event: FormEvent) {
    event.preventDefault();
    const query = value.trim().replace(/^#/, "");
    if (/^\d{1,9}$/.test(query)) router.push(`/agents/${Number(query)}`);
    else if (/^0x[0-9a-fA-F]{40}$/.test(query) || /^0\.0\.\d{1,12}$/.test(query)) router.push(`/owners/${query}`);
    else setError("Enter an agent ID like 140, a wallet address (0x…) or a Hedera account (0.0.…).");
  }

  return (
    <form onSubmit={open} role="search">
      <label htmlFor="lookup" className="text-[13px] text-muted">
        Look up any agent or owner
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5 focus-within:border-muted">
          <Search size={15} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            id="lookup"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="140, 0x… or 0.0.…"
            autoComplete="off"
            spellCheck={false}
            className="w-full min-w-0 bg-transparent font-mono text-[14px] text-fg outline-none placeholder:text-muted"
          />
        </div>
        <button type="submit" className="rounded-xl bg-fg px-4 py-2.5 text-[14px] font-semibold text-canvas transition hover:opacity-85">
          Open
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] text-accent">{error}</p>}
    </form>
  );
}
