import type { StatusEntry } from "./_components/OrderTimeline";

// Shared by the orders list and the per-order detail page, so the two cannot
// disagree about the shape the admin API returns.

/** Forward status path. Anything off it is terminal — see TERMINAL below. */
export const FLOW = ["placed", "confirmed", "processing", "shipped", "delivered"];

/**
 * Every status the API can return, which is not the same list as FLOW.
 *
 * `returned` is in the order model's enum but was missing here, and its absence
 * was not cosmetic. The list page derived the advance button from
 * `FLOW[FLOW.indexOf(status) + 1]`, and `indexOf` returns -1 for a status not on
 * the path — so a returned order rendered a button reading "→ placed" that,
 * clicked, sent a returned order back to the start of the flow. It was also
 * missing from the filter tabs, so the only way to see one was "all".
 */
export const STATUSES = ["all", ...FLOW, "cancelled", "refunded", "returned"];

/** Statuses with nowhere left to advance to. */
export const TERMINAL = new Set(["delivered", "cancelled", "refunded", "returned"]);

/**
 * The next status, or null when there isn't one.
 *
 * Centralised so the list and the detail page can't disagree, and so the
 * -1 case is handled once rather than by every caller doing its own arithmetic.
 */
export function nextStatus(current: string): string | null {
  const i = FLOW.indexOf(current);
  if (i === -1) return null; // off the flow entirely (cancelled/refunded/returned)
  return FLOW[i + 1] ?? null; // delivered is the end of the line
}

/**
 * Cancelling and refunding both have to say why -- the API rejects a missing
 * reason, and an order that just reads "cancelled" tells whoever opens it
 * later nothing. The prompt doubles as the confirmation step, so callers no
 * longer show a separate confirm(). Returns null when the admin backs out.
 *
 * Lives here rather than in either page so the list and the detail page ask
 * the same way and enforce the same minimum.
 */
export function askReason(question: string): string | null {
  const answer = window.prompt(question);
  if (answer === null) return null; // dismissed
  const trimmed = answer.trim();
  if (trimmed.length < 3) {
    window.alert("Please give a reason of at least 3 characters.");
    return null;
  }
  return trimmed;
}

export interface AdminOrder {
  _id: string;
  orderNumber: string;
  total: number;
  status: string;
  itemCount: number;
  createdAt: string;
  user?: { fullName?: string; email?: string };
  deliveryAddress?: { fullName?: string; province?: string };
}

export interface OrderItem {
  book?: string;
  title: string;
  author: string;
  format?: string;
  coverImage?: string;
  price: number;
  quantity: number;
}

export interface AdminOrderDetail extends AdminOrder {
  items: OrderItem[];
  statusHistory?: StatusEntry[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  paymentMethod: string;
  paymentStatus: string;
  deliveryMethod: string;
  customerNote?: string;
  cancellationReason?: string;
  refundReason?: string;
  user?: { fullName?: string; email?: string; phone?: string };
  deliveryAddress?: {
    fullName?: string;
    phone?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
  };
}
