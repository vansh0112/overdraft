import { Check, CircleX, LoaderCircle } from "lucide-react";
import type { Job } from "@/lib/api";

/** The steps of an enrolment or credit check as the server works through them. */
export function JobProgress<R>({ job }: { job: Job<R> }) {
  const current = job.steps.findIndex((s) => !s.done);
  return (
    <div>
      <ol className="space-y-2.5">
        {job.steps.map((step, i) => {
          const active = job.state === "running" && i === current;
          const failed = job.state === "failed" && i === current;
          return (
            <li key={step.label} className="flex items-center gap-2.5 text-[14px]">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  step.done ? "bg-accent text-accent-ink" : failed ? "text-accent" : "border border-line text-muted"
                }`}
                aria-hidden="true"
              >
                {step.done ? <Check size={12} strokeWidth={3} /> : failed ? <CircleX size={18} /> : active ? <LoaderCircle size={12} className="animate-spin" /> : null}
              </span>
              <span className={step.done ? "text-fg" : active ? "text-fg" : "text-muted"}>{step.label}</span>
            </li>
          );
        })}
      </ol>
      {job.state === "queued" && <p className="mt-3 text-[13px] text-muted">Waiting for the previous request to finish…</p>}
      {job.state === "failed" && job.error && <p className="mt-3 text-[13px] text-accent">{job.error}</p>}
    </div>
  );
}
