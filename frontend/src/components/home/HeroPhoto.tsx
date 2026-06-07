import Image from "next/image";

/**
 * Hero photograph — a warm stack of well-read books against the cool page
 * background, with a small "staff note" quote card overlapping the corner.
 * Image lives in /public so next/image needs no remote-domain config.
 */
export function HeroPhoto() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5">
        <Image
          src="/hero-books.jpg"
          alt="A stack of well-read books in a sunlit shop"
          fill
          priority
          sizes="(max-width: 768px) 90vw, 460px"
          className="object-cover"
        />
      </div>

    </div>
  );
}
