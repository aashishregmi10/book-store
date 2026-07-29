# Genre taxonomy — proposal

Needs sign-off before migration: genre slugs are permanent URLs, and changing
them later costs another round of 301s and re-indexing.

## Why the current one failed

| Fact | Number |
| --- | --- |
| Books in the catalogue | 2294 |
| Sitting in `general` | 2063 (90%) |
| With no genre at all | 11 |
| Genres holding exactly 1 book | `games`, `strategy`, `spirituality`, `horror` |

The cause is in code, not data entry. `src/utils/genreMap.js` maps provider
subject strings onto only 8 outcomes and has no rule for biography, law,
philosophy, politics, spirituality, horror, educational, strategy or games. It
returns `null` for anything unmatched, and both import scripts fall back to
`genre: 'general'`. So the import silently swept 90% of the catalogue into one
bucket.

Two consequences worth naming:

- `general` is not a genre, it is an inbox. `/genre/general` returns 90% of the
  catalogue, which is why genre filtering *looks* broken — the filter works
  correctly (verified), the data behind it does not.
- Four genres with one book each are dead pages: thin content, nothing to
  browse, and a weak internal-linking signal for the silo.

## Proposed taxonomy — 16 genres

Derived from a random sample of what is actually in `general`, not from a
generic list. Every proposed genre has real volume behind it.

| Slug | Name | Covers |
| --- | --- | --- |
| `fiction` | Fiction | Literary and general novels |
| `sci-fi-fantasy` | Science Fiction & Fantasy | Speculative, epic fantasy |
| `mystery-thriller` | Mystery & Thriller | Crime, suspense |
| `romance` | Romance | Incl. commercial romance |
| `young-adult` | Young Adult | YA fiction across genres |
| `childrens` | Children's | Picture books, early readers |
| `biography-memoir` | Biography & Memoir | Life writing, autobiography |
| `business-economics` | Business & Economics | Management, investing, economics |
| `self-help` | Self-Help | Habits, productivity, personal growth |
| `psychology` | Psychology | Behavioural science, mind |
| `spirituality-religion` | Spirituality & Religion | Yoga, scripture, philosophy of faith |
| `philosophy` | Philosophy | Classical and modern |
| `politics-society` | Politics & Society | Current affairs, history, world |
| `science-technology` | Science & Technology | Popular science, tech |
| `poetry` | Poetry | Verse, collections |
| `nepali-literature` | Nepali Literature | Nepali-language and Nepal-authored |

Retired: `general` (an inbox, not a genre), `games`, `strategy` → folded into
`business-economics`, `horror` → `mystery-thriller`, `educational` and `law` →
see below.

**`kids`, `manga` and `loksewa` stay as `category` sections**, unchanged. They
are a separate axis from genre and already work that way in the schema.

## Slug changes needing 301 redirects

Kept as-is (no redirect): `fiction`, `self-help`, `poetry`, `nepali-literature`,
`philosophy`.

| Old URL | New URL |
| --- | --- |
| `/genre/biography` | `/genre/biography-memoir` |
| `/genre/business` | `/genre/business-economics` |
| `/genre/politics` | `/genre/politics-society` |
| `/genre/spirituality` | `/genre/spirituality-religion` |
| `/genre/horror` | `/genre/mystery-thriller` |
| `/genre/strategy`, `/genre/games` | `/genre/business-economics` |
| `/genre/law`, `/genre/educational` | `/genre/politics-society`, `/genre/science-technology` |
| `/genre/general` | `/books` |

These are low-traffic today (most hold 1–2 books), so the SEO cost of the
restructure is close to zero *now* — it gets more expensive the longer it waits.

## Open question

`law` (2 books) and `educational` (2 books) have no natural home in the list
above. Options: keep both as their own genres (17–18 total), or fold them as
shown. Folding is cleaner unless the shop intends to stock them properly.

## Reclassification plan

1. Create the new genres; keep the old ones until step 4.
2. For each of the 2294 books, resolve subject data by ISBN (1982 of the 2063
   `general` books have one) via `src/utils/bookLookup.js`, which already
   queries Open Library and Google Books and returns `categories`.
3. Widen `genreMap.js` to cover all 16 genres, and score each match. Auto-apply
   above the confidence threshold; write the rest to a review CSV.
4. Redirect old slugs, update the sitemap, delete the retired genres.
5. Fix `Genre.bookCount` — every genre currently reports 0, so the mega-menu
   counts and any "N books" copy are wrong regardless of this work.
