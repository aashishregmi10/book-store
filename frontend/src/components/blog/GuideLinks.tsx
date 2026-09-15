import Link from "next/link";
import type { ArticleCard } from "@/lib/types";

/**
 * A compact list of links to editorial guides.
 *
 * This exists because the guides were unreachable. Twenty-seven articles were
 * published and every one of them had exactly one inbound link — the /blog
 * index — because nothing else on the site pointed at an individual article.
 * Not a genre page, not a book page, not even another guide. That is a poor
 * showing for the only genuinely distinctive writing on a catalogue of 5,800
 * syndicated blurbs.
 *
 * Deliberately text-only. Article covers are large and mostly decorative, and
 * this block appears below the fold on pages that already carry 48 book covers;
 * adding three more images would cost real LCP on a 3G phone for no editorial
 * gain. Titles and excerpts are what a reader scans and what a crawler reads.
 */
export function GuideLinks({
  articles,
  heading,
  intro,
  className = "",
}: {
  articles: ArticleCard[];
  heading: string;
  intro?: string;
  className?: string;
}) {
  if (!articles.length) return null;

  return (
    <section className={`border-t border-border pt-8 ${className}`} aria-labelledby="guide-links">
      <h2 id="guide-links" className="font-display text-xl text-text sm:text-2xl">
        {heading}
      </h2>
      {intro && <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-muted">{intro}</p>}

      <ul className="mt-5 divide-y divide-border border-y border-border">
        {articles.map((a) => (
          <li key={a._id || a.slug}>
            <Link href={`/blog/${a.slug}`} className="group block py-4">
              <h3 className="font-display text-base leading-snug text-text transition-colors group-hover:text-accent sm:text-lg">
                {a.title}
              </h3>
              {a.excerpt && (
                <p className="mt-1.5 line-clamp-2 font-body text-sm leading-relaxed text-muted">{a.excerpt}</p>
              )}
              <p className="mt-2 font-data text-xs uppercase tracking-[0.12em] text-muted">
                {a.category || "Reading guides"}
                {a.readingTime ? ` · ${a.readingTime} min read` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
