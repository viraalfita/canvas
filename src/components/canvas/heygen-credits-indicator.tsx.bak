"use client";

import { useEffect, useState } from "react";
import { UserSquareIcon, RefreshCwIcon } from "lucide-react";

type Account = {
  email?: string;
  plan?: string;
  premium_credits_remaining: number | null;
  premium_credits_resets_at?: string;
  addon_credits_remaining: number | null;
};

/** Mirror of BalanceIndicator but for HeyGen. Hidden when HeyGen isn't
 *  connected — avoids a confusing "disconnected" badge for users who don't
 *  use HeyGen. */
export function HeygenCreditsIndicator({ refreshKey }: { refreshKey?: number }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/heygen/account", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Account;
      })
      .then((a) => {
        if (!cancelled) {
          setAccount(a);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function manualRefresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/heygen/account", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccount(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Stay invisible when HeyGen isn't connected — keeps the toolbar uncluttered
  // for workflows that don't touch HeyGen.
  if (error || !account) return null;

  const remaining = account.premium_credits_remaining ?? 0;
  const low = remaining <= 1;

  return (
    <button
      onClick={manualRefresh}
      title={`HeyGen ${account.plan ?? ""} — premium credits remaining${account.premium_credits_resets_at ? ` (resets ${new Date(account.premium_credits_resets_at).toLocaleDateString()})` : ""}`}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
        low
          ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          : "border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
      }`}
    >
      <UserSquareIcon className="h-3 w-3" />
      <span>HeyGen {remaining}</span>
      <RefreshCwIcon
        className={`h-3 w-3 ${loading ? "animate-spin" : "opacity-50"}`}
      />
    </button>
  );
}
