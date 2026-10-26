"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

/** Grace period before a hover-out closes the panel, so a diagonal mouse path
 *  from the trigger down into the panel doesn't dismiss it mid-move. */
const CLOSE_DELAY_MS = 140;

/**
 * A header menu that opens on hover or keyboard focus.
 *
 * The panel's links are server-rendered and stay in the DOM while closed
 * (toggled with `hidden`, never unmounted): the genre silo depends on these
 * internal links being crawlable, and a menu that only fills on hover is
 * invisible to crawlers. With an `href` the trigger is a real link too, so it
 * works without JS and taps straight through on touch. Escape closes it, and so
 * does focus leaving the group or a click on any link inside.
 */
export function NavDropdown({
  label,
  href,
  active,
  icon,
  panelClassName = "",
  align = "left",
  children,
}: {
  label: string;
  href?: string;
  active?: boolean;
  icon?: React.ReactNode;
  panelClassName?: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onFocusIn = (e: FocusEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  const triggerCls = `flex min-h-11 items-center gap-1.5 whitespace-nowrap px-3 font-body text-[15px] transition-colors hover:text-accent ${
    active || open ? "text-accent" : "text-text"
  }`;
  const inner = (
    <>
      {icon}
      <span className={open ? "underline decoration-2 underline-offset-[6px]" : ""}>{label}</span>
      <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
    </>
  );

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      {href ? (
        <Link href={href} aria-expanded={open} aria-haspopup="true" onFocus={() => setOpen(true)} className={triggerCls}>
          {inner}
        </Link>
      ) : (
        <button type="button" aria-expanded={open} aria-haspopup="true" onFocus={() => setOpen(true)} onClick={() => setOpen((o) => !o)} className={triggerCls}>
          {inner}
        </button>
      )}

      <div
        hidden={!open}
        className={`absolute top-full z-50 pt-2 ${align === "right" ? "right-0" : "left-0"}`}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className={`rounded-lg border border-border bg-bg p-6 shadow-[0_16px_40px_-16px_rgba(51,58,63,0.28)] ${panelClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
