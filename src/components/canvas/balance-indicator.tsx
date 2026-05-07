"use client";

import { useEffect, useState } from "react";
import { WalletIcon, RefreshCwIcon } from "lucide-react";

type Balance = { remain: number; used: number; unlimited: boolean };

export function BalanceIndicator({ refreshKey }: { refreshKey?: number }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch balance whenever refreshKey changes (mount = 0). No synchronous
  // setState in the effect body — only update after async resolution.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/apimart/balance", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as Balance;
      })
      .then((b) => {
        if (!cancelled) {
          setBalance(b);
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
      const res = await fetch("/api/apimart/balance", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setBalance(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (error) {
    return (
      <span className="text-xs text-red-400" title={error}>
        balance unavailable
      </span>
    );
  }
  if (!balance) {
    return (
      <span className="flex items-center gap-1 text-xs text-neutral-500">
        <WalletIcon className="h-3 w-3" />
        loading…
      </span>
    );
  }
  return (
    <button
      onClick={manualRefresh}
      title="Refresh APImart balance"
      className="flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
    >
      <WalletIcon className="h-3 w-3" />
      {balance.unlimited ? (
        <span>unlimited</span>
      ) : (
        <>
          <span>remain {balance.remain.toFixed(2)}</span>
          <span className="text-neutral-500">· used {balance.used.toFixed(2)}</span>
        </>
      )}
      <RefreshCwIcon
        className={`h-3 w-3 ${loading ? "animate-spin" : "opacity-50"}`}
      />
    </button>
  );
}
