import type { Genre } from "./types";

/**
 * The header's category bar groups the 21 genres the way a bookshop arranges
 * its floor: fiction, non-fiction, and a corner for younger readers (which also
 * holds the Kids and Manga sections — those are sections, not genres, see
 * /CLAUDE.md).
 *
 * Genres are matched by slug. One that isn't listed here (a genre added later)
 * still shows, at the end of Non-fiction — it must never silently drop out of
 * the menu, because these links are part of the genre silo's internal linking.
 */
const GROUPS: { key: string; label: string; slugs: string[]; extras?: { href: string; label: string }[] }[] = [
  {
    key: "fiction",
    label: "Fiction",
    slugs: ["fiction", "nepali-literature", "mystery-thriller", "romance", "sci-fi-fantasy", "poetry"],
  },
  {
    key: "non-fiction",
    label: "Non-fiction",
    slugs: [
      "self-help",
      "business-economics",
      "biography-memoir",
      "psychology",
      "spirituality-religion",
      "philosophy",
      "politics-society",
      "science-technology",
      "health-wellness",
      "education-reference",
      "food-cooking",
      "art-craft",
      "games-hobbies",
    ],
  },
  {
    key: "young",
    label: "Kids & teens",
    slugs: ["childrens", "young-adult"],
    extras: [
      { href: "/category/kids", label: "All kids' books" },
      { href: "/category/manga", label: "Manga" },
    ],
  },
];

export interface GenreGroup {
  key: string;
  label: string;
  genres: Genre[];
  extras: { href: string; label: string }[];
}

export function groupGenres(genres: Genre[]): GenreGroup[] {
  const bySlug = new Map(genres.map((g) => [g.slug, g]));
  const placed = new Set<string>();
  const groups = GROUPS.map((g) => {
    const list = g.slugs.map((s) => bySlug.get(s)).filter((x): x is Genre => Boolean(x));
    list.forEach((x) => placed.add(x.slug));
    return { key: g.key, label: g.label, genres: list, extras: g.extras ?? [] };
  });
  const unplaced = genres.filter((g) => !placed.has(g.slug)).sort((a, b) => a.name.localeCompare(b.name));
  const nonFiction = groups.find((g) => g.key === "non-fiction");
  if (nonFiction) nonFiction.genres.push(...unplaced);
  return groups.filter((g) => g.genres.length || g.extras.length);
}
