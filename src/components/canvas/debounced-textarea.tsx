"use client";

import {
  useEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from "react";

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  value: string;
  /** Called with the new text, debounced while typing + flushed on blur. */
  onCommit: (value: string) => void;
  /** Debounce delay in ms (default 300). */
  delay?: number;
};

/**
 * Textarea whose value is held in local state so each keystroke re-renders only
 * this input — not the whole canvas. The expensive store write (onCommit) is
 * debounced while typing and flushed on blur/unmount. This is what keeps typing
 * responsive: previously every keystroke wrote to the global node store, which
 * re-rendered every UpstreamRefs / SceneComposer on the canvas.
 */
export function DebouncedTextarea({ value, onCommit, delay = 300, ...rest }: Props) {
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest values for the unmount flush (closures captured at mount go stale).
  const latest = useRef({ local, value, onCommit });
  latest.current = { local, value, onCommit };

  // Pull external changes in (hydration, ✨ Enhance) only while NOT typing, so
  // we never clobber an in-progress edit or reset the caret.
  useEffect(() => {
    if (!editing.current) setLocal(value);
  }, [value]);

  // Flush a pending edit if the node unmounts (e.g. scrolled off-screen).
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        const l = latest.current;
        if (l.local !== l.value) l.onCommit(l.local);
      }
    },
    [],
  );

  return (
    <textarea
      {...rest}
      value={local}
      onChange={(e) => {
        editing.current = true;
        setLocal(e.target.value);
        if (timer.current) clearTimeout(timer.current);
        const next = e.target.value;
        timer.current = setTimeout(() => {
          timer.current = null;
          onCommit(next);
        }, delay);
      }}
      onBlur={(e) => {
        editing.current = false;
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        if (local !== value) onCommit(local);
        rest.onBlur?.(e);
      }}
    />
  );
}
