/**
 * Shopping-cart glyph with a latticed basket — the classic storefront cart,
 * rather than lucide's plain outline bag. Drawn here instead of imported so
 * the basket grid and the two wheels stay recognisable at the 16px the Add to
 * cart button renders it at.
 *
 * `currentColor` throughout, so it inherits the button's text colour.
 */
export function CartIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* Handle running down into the basket's left edge */}
      <path d="M1.5 2.5h2.6l2.2 10.4a1.6 1.6 0 0 0 1.6 1.3h9a1.6 1.6 0 0 0 1.6-1.2l1.9-7.3H5" />
      {/* Basket lattice — two uprights and one cross-rail */}
      <path d="M9.4 5.9l.9 6.9M14.3 5.9l-.8 6.9M6.2 8.7h13.3" strokeWidth={1.25} />
      {/* Wheels */}
      <circle cx="9.5" cy="20" r="1.7" />
      <circle cx="17.5" cy="20" r="1.7" />
    </svg>
  );
}
