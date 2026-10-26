"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { npr } from "@/lib/format";
import type { BookCardData } from "@/lib/types";

export interface HeroSlide {
  key: string;
  tone: "coffee" | "brand" | "tint";
  kicker: string;
  /** The first slide's kicker is the homepage <h1>: heading level and type scale are separate calls. */
  kickerIsH1?: boolean;
  title: string;
  text: React.ReactNode;
  cta: { label: string; href: string };
  books: BookCardData[];
}

const TONES = {
  coffee: { box: "bg-latte text-espresso", muted: "text-coffee-muted", button: "bg-coffee text-white hover:bg-coffee-hover" },
  brand: { box: "bg-accent text-white", muted: "text-white/85", button: "bg-white text-accent hover:bg-white/90" },
  tint: { box: "bg-tint text-text", muted: "text-muted", button: "bg-accent text-white hover:bg-accent-hover" },
} as const;

const INTERVAL_MS = 7000;
const REDUCED = "(prefers-reduced-motion: reduce)";
// Read the motion preference without a server/client mismatch: the server
// assumes motion is fine, the browser reports the truth after hydration.
const subscribeReduced = (cb: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

// Next 16 deprecates `priority`; the docs steer above-the-fold images that
// aren't a single sure LCP element to eager loading plus a fetch-priority hint.
function Cover({ book, eager }: { book: BookCardData; eager: boolean }) {
  return (
    <Link
      href={`/books/${book.slug}`}
      className="relative block w-[5.5rem] shrink-0 sm:w-32 lg:w-28 xl:w-40"
      aria-label={`${book.title} by ${book.author}, ${npr(book.price)}`}
    >
      <span className="relative block aspect-[2/3] overflow-hidden rounded-[3px] bg-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] ring-1 ring-black/10">
        {book.coverImage?.secureUrl ? (
          <Image
            src={book.coverImage.secureUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 160px, (min-width: 640px) 128px, 88px"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            className="object-cover"
          />
        ) : null}
      </span>
      <span className="absolute bottom-2 left-2 rounded-full bg-text/90 px-2 py-0.5 font-data text-[11px] font-semibold text-white">
        {npr(book.price)}
      </span>
    </Link>
  );
}

function Slide({ slide, index, count, current }: { slide: HeroSlide; index: number; count: number; current: number }) {
  const tone = TONES[slide.tone];
  const hidden = index !== current;
  const kickerCls = `font-data text-xs font-semibold uppercase tracking-[0.18em] ${tone.muted}`;
  return (
    <section
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}`}
      aria-hidden={hidden}
      inert={hidden}
      className={`flex w-full shrink-0 snap-center flex-col gap-5 px-5 py-7 sm:gap-6 sm:px-12 sm:py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10 lg:min-h-[360px] lg:px-14 xl:px-16 ${tone.box}`}
    >
      <div className="max-w-xl">
        {slide.kickerIsH1 ? <h1 className={kickerCls}>{slide.kicker}</h1> : <p className={kickerCls}>{slide.kicker}</p>}
        <h2 className="mt-3 font-display text-[1.75rem] font-semibold leading-tight sm:text-4xl xl:text-5xl">{slide.title}</h2>
        <p className={`mt-3 max-w-md font-body text-[15px] leading-relaxed sm:mt-4 ${tone.muted}`}>{slide.text}</p>
        <Link
          href={slide.cta.href}
          className={`mt-5 inline-flex min-h-12 items-center gap-2 rounded-md px-6 font-body text-base font-medium transition-colors sm:mt-6 ${tone.button}`}
        >
          {slide.cta.label} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
      {/* Three covers fit from 360px; on the narrowest phones the third would
          push past the slide into its neighbour, so it drops out there. */}
      {slide.books.length > 0 && (
        <div className="flex gap-3 sm:gap-4 max-[359px]:[&>*:nth-child(3)]:hidden">
          {slide.books.slice(0, 3).map((b) => (
            <Cover key={b._id} book={b} eager={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The homepage's opening banner: three honest messages, each carried by real
 * covers from the shop's own shelves. It moves on by itself, but stops while the
 * pointer or keyboard focus is on it, when paused, and for people who ask for
 * less motion; a swipe, the arrows or the dots move it by hand.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  useEffect(() => {
    if (paused || hovered || reduced || slides.length < 2) return;
    const timer = setInterval(() => {
      const el = track.current;
      if (!el || !el.clientWidth) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, hovered, reduced, slides.length]);

  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  const arrow =
    "absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full border border-border bg-white text-text shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] transition-colors hover:text-accent md:grid";

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="Highlights"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div ref={track} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map((s, i) => (
          <Slide key={s.key} slide={s} index={i} count={slides.length} current={current} />
        ))}
      </div>

      {slides.length > 1 && (
        <>
          <button type="button" className={`${arrow} -left-5`} onClick={() => goTo((current - 1 + slides.length) % slides.length)} aria-label="Previous highlight">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" className={`${arrow} -right-5`} onClick={() => goTo((current + 1) % slides.length)} aria-label="Next highlight">
            <ChevronRight className="size-5" />
          </button>
          <div className="mt-3 flex items-center justify-center gap-1">
            {slides.map((s, i) => (
              <button key={s.key} type="button" onClick={() => goTo(i)} aria-label={`Show highlight ${i + 1}`} aria-current={i === current} className="grid size-8 place-items-center">
                <span className={`block h-2 rounded-full transition-all ${i === current ? "w-7 bg-text" : "w-2 bg-border"}`} />
              </button>
            ))}
            {!reduced && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Play the highlights" : "Pause the highlights"}
                className="ml-1 grid size-8 place-items-center text-muted hover:text-text"
              >
                {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
