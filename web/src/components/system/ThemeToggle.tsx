"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Switches between the light and dark theme and remembers the choice. The first paint already uses it. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    try {
      localStorage.setItem("overdraft.theme", next);
    } catch {}
    listeners.forEach((l) => l());
    window.setTimeout(() => root.classList.remove("theme-switching"), 300);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg ${className}`}
    >
      <Sun size={16} className={`absolute transition-all duration-300 ${theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0"}`} />
      <Moon size={16} className={`absolute transition-all duration-300 ${theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0"}`} />
    </button>
  );
}
