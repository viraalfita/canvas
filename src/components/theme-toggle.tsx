"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single-button theme toggle (light ↔ dark). Renders a placeholder on first
 * paint to avoid hydration mismatch — next-themes only knows the resolved
 * theme after mount.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md",
        "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        "dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
        className,
      )}
    >
      {/* Match server-render: blank icon until mounted to avoid flash. */}
      {!mounted ? (
        <span className="h-4 w-4" />
      ) : isDark ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
    </button>
  );
}
