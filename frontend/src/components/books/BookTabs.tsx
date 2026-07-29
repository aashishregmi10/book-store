"use client";

import { useId, useRef, useState } from "react";

export interface BookTab {
  /** Stable key, also used in the URL fragment. */
  id: string;
  label: string;
  /** Optional count shown beside the label, e.g. "Reader reviews (12)". */
  count?: number;
  panel: React.ReactNode;
}

/**
 * Tabbed panels for the book detail page.
 *
 * SEO note — this is why panels are hidden rather than unmounted: the house
 * rule is that the HTML must contain everything that matters for search and
 * for AI answer engines. Panels arrive as already-server-rendered nodes and
 * every one of them is emitted into the DOM; switching tabs only flips the
 * `hidden` attribute. Conditionally rendering the active panel would strip the
 * description, reviews, and Q&A out of the server HTML and undo the JSON-LD
 * the page emits alongside them.
 *
 * Keyboard behaviour follows the WAI-ARIA tabs pattern: arrows move between
 * tabs, Home/End jump to the ends.
 */
export function BookTabs({ tabs }: { tabs: BookTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (tabs.length === 0) return null;

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  function onKeyDown(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;

    e.preventDefault();
    const id = tabs[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className="mt-12 border-t border-border pt-8">
      <div role="tablist" aria-label="Book information" onKeyDown={onKeyDown} className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border">
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              id={tabId(t.id)}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={panelId(t.id)}
              // Roving tabindex: only the active tab is in the tab order, and
              // arrow keys move between them from there.
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={`-mb-px min-h-11 border-b-2 px-1 py-2 font-data text-sm uppercase tracking-wide transition-colors ${
                selected ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"
              }`}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && <span className="ml-1.5 text-xs text-muted">({t.count})</span>}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <section
          key={t.id}
          id={panelId(t.id)}
          role="tabpanel"
          aria-labelledby={tabId(t.id)}
          hidden={t.id !== active}
          tabIndex={0}
          className="pt-6"
        >
          {t.panel}
        </section>
      ))}
    </div>
  );
}
