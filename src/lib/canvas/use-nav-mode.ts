"use client";

import { useEffect, useState } from "react";

export type NavMode = "dock" | "sidebar";
const STORAGE_KEY = "canvas:nav-mode";
const DEFAULT: NavMode = "dock";

/**
 * Module-level state shared by every `useNavMode()` instance. Without this,
 * toggling in the toolbar would only update the toolbar's local state — the
 * canvas-editor's hook wouldn't re-render, and the layout would only switch
 * on next reload (when localStorage gets re-read).
 */
let currentMode: NavMode = DEFAULT;
const listeners = new Set<(m: NavMode) => void>();

function broadcast(next: NavMode) {
  currentMode = next;
  for (const fn of listeners) fn(next);
}

function readStored(): NavMode {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "sidebar" || raw === "dock" ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/**
 * Read + persist the canvas navigation layout choice (floating dock vs.
 * left sidebar). Every caller subscribes to the same source of truth, so
 * toggling from one place instantly re-renders all consumers.
 */
export function useNavMode(): {
  mode: NavMode;
  setMode: (m: NavMode) => void;
  toggle: () => void;
} {
  const [mode, setLocal] = useState<NavMode>(currentMode);

  useEffect(() => {
    // First mount: pull persisted value and rebroadcast if different. This
    // is also where SSR's DEFAULT gets reconciled with the user's saved
    // preference.
    const stored = readStored();
    if (stored !== currentMode) {
      broadcast(stored);
    } else {
      // Make sure this hook's local state matches the module state in case
      // module state was updated by another component before mount.
      setLocal(currentMode);
    }
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  function setMode(next: NavMode) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore quota / private-mode errors
    }
    broadcast(next);
  }

  function toggle() {
    setMode(currentMode === "sidebar" ? "dock" : "sidebar");
  }

  return { mode, setMode, toggle };
}
