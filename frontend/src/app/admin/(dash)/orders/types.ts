import type { StatusEntry } from "./_components/OrderTimeline";

// Shared by the orders list and the per-order detail page, so the two cannot
// disagree about the shape the admin API returns.

/** Forward status path. Anything off it (cancelled, refunded) is terminal. */
export const FLOW = ["placed", "confirmed", "processing", "shipped", "delivered"];
export const STATUSES = ["all", ...FLOW, "cancelled", "refunded"];

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
