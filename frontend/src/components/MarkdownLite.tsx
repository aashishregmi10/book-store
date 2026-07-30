import Image from "next/image";
import Link from "next/link";

/**
 * Minimal, dependency-free, XSS-safe markdown renderer for article bodies.
 *
 * Blocks:  ## / ### headings, - / * bullets, 1. ordered lists, > blockquotes,
 *          ![alt](src) images, --- rules, paragraphs.
 * Inline:  **bold**, *italic*, `code`, [text](href).
 *
 * Inline formatting and links matter more than they look: every seeded article
 * body already uses **bold** and [text](/path), and the previous version
 * rendered neither — so readers saw the literal asterisks and brackets on the
 * page. Links were the worse half, because in-body internal links into the
 * catalogue are the whole point of these guides.
 *
 * Still no raw HTML: every branch below emits React elements from parsed text,
 * so article bodies can never inject markup.
 */

/** Split a line into React nodes, honouring **bold**, *italic*, `code`, [link](href). */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // One pass over the four inline forms, longest delimiter first so ** wins over *.
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;

    if (tok.startsWith("**")) {
      out.push(<strong key={key} className="font-semibold text-text">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`")) {
      out.push(
        <code key={key} className="rounded bg-surface px-1.5 py-0.5 font-data text-[0.9em] text-text">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      const label = tok.slice(1, close);
      const href = tok.slice(close + 2, -1);
      // Internal links get next/link for client-side nav; external ones are
      // plain anchors with noopener, and never next/link.
      out.push(
        href.startsWith("/") ? (
          <Link key={key} href={href} className="text-accent underline underline-offset-2 hover:no-underline">
            {label}
          </Link>
        ) : (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent underline underline-offset-2 hover:no-underline"
          >
            {label}
          </a>
        )
      );
    } else {
      out.push(<em key={key} className="italic">{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `![alt](src)` — only Cloudinary/Open Library hosts are configured for
 *  next/image, which is where admin-uploaded article images land. */
function BodyImage({ alt, src }: { alt: string; src: string }) {
  return (
    <figure className="my-8">
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-border bg-surface">
        <Image src={src} alt={alt} fill sizes="(max-width: 768px) 92vw, 720px" className="object-cover" />
      </div>
      {alt && <figcaption className="mt-2 text-center font-body text-sm text-muted">{alt}</figcaption>}
    </figure>
  );
}

export function MarkdownLite({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);

  return (
    <div className="space-y-5 font-body text-[1.0625rem] leading-[1.75] text-text sm:text-lg">
      {blocks.map((raw, i) => {
        const block = raw.trim();
        if (!block) return null;
        const key = `b${i}`;

        // A standalone image is its own block, not a paragraph.
        const img = block.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (img) return <BodyImage key={key} alt={img[1]} src={img[2]} />;

        if (/^---+$/.test(block)) return <hr key={key} className="my-10 border-border" />;

        if (block.startsWith("### ")) {
          return (
            <h3 key={key} className="pt-2 font-display text-xl text-text">
              {renderInline(block.slice(4), key)}
            </h3>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h2 key={key} className="scroll-mt-24 pt-4 font-display text-2xl text-text sm:text-[1.75rem]">
              {renderInline(block.slice(3), key)}
            </h2>
          );
        }
        if (block.startsWith("> ")) {
          return (
            <blockquote key={key} className="border-l-2 border-accent pl-4 font-body italic text-muted">
              {renderInline(block.slice(2), key)}
            </blockquote>
          );
        }

        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={key} className="list-disc space-y-2 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.replace(/^[-*]\s+/, ""), `${key}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l))) {
          return (
            <ol key={key} className="list-decimal space-y-2 pl-6">
              {lines.map((l, j) => (
                <li key={j}>{renderInline(l.replace(/^\d+\.\s+/, ""), `${key}-${j}`)}</li>
              ))}
            </ol>
          );
        }

        return <p key={key}>{renderInline(block, key)}</p>;
      })}
    </div>
  );
}
