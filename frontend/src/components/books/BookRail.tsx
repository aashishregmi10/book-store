"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BookCardData } from "@/lib/types";
import { BookCard } from "./BookCard";

export function BookRail({
  title,
  books,
  href,
}: {
  title: string;
  books: BookCardData[];
  href?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Click-and-drag to slide with a mouse (touch uses native scrolling).
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  if (!books?.length) return null;
  const items = books.slice(0, 20);

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || !scroller.current) return;
    drag.current = { active: true, startX: e.clientX, startLeft: scroller.current.scrollLeft, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current.active || !scroller.current) return;
    const dx = e.clientX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    scroller.current.scrollLeft = drag.current.startLeft - dx;
  }
  function endDrag() {
    drag.current.active = false;
  }
  // Swallow the click that ends a drag so cards don't navigate mid-slide.
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  return (
    <section className="mx-auto max-w-[1600px] px-6 py-10 sm:px-8 lg:px-16 xl:px-24">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="font-display text-2xl text-text sm:text-3xl">{title}</h2>
        {href && (
          <Link
            href={href}
            className="group inline-flex items-center gap-1 font-data text-xs uppercase tracking-wide text-accent"
          >
            See all titles
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>

      <div
        ref={scroller}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className="-mx-4 flex cursor-grab gap-5 overflow-x-auto px-4 pb-2 select-none active:cursor-grabbing sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((b) => (
          <div key={b.slug} className="w-[44vw] shrink-0 sm:w-[180px]">
            <BookCard book={b} />
          </div>
        ))}
      </div>
    </section>
  );
}
