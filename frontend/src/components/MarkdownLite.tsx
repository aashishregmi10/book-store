/**
 * Minimal, dependency-free, XSS-safe markdown renderer for article bodies.
 * Supports: ## / ### headings, - / * bullet lists, 1. ordered lists,
 * > blockquotes, and paragraphs. No raw HTML is ever injected.
 */
export function MarkdownLite({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);

  return (
    <div className="space-y-5 font-body text-lg leading-relaxed text-text">
      {blocks.map((raw, i) => {
        const block = raw.trim();
        if (!block) return null;
        if (block.startsWith("### ")) return <h3 key={i} className="font-display text-xl text-text">{block.slice(4)}</h3>;
        if (block.startsWith("## ")) return <h2 key={i} className="font-display text-2xl text-text">{block.slice(3)}</h2>;
        if (block.startsWith("> ")) {
          return (
            <blockquote key={i} className="border-l-2 border-accent pl-4 font-body italic text-muted">
              {block.slice(2)}
            </blockquote>
          );
        }
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-6">
              {lines.map((l, j) => <li key={j}>{l.replace(/^[-*]\s+/, "")}</li>)}
            </ul>
          );
        }
        if (lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1.5 pl-6">
              {lines.map((l, j) => <li key={j}>{l.replace(/^\d+\.\s+/, "")}</li>)}
            </ol>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}
