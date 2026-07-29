# Order lifecycle — what's actually implemented

Audit of the placed → refunded path as it exists today, written while adding the
status timeline to the admin order detail. Reference implementation for the
timeline UI was can-logistic's `HistoryTimeline`.

Source of truth: `src/models/order.model.js`, `src/routes/orders.route.js`
(customer), `src/routes/admin.route.js` (admin).

---

## The happy path

```
placed → confirmed → processing → shipped → delivered
```

Defined three times, and they agree:

| Where | Constant |
| --- | --- |
| `admin.route.js` | `STATUS_FLOW` |
| `frontend .../orders/page.tsx` | `FLOW` |
| `frontend .../orders/_components/OrderTimeline.tsx` | `FLOW` |

Advancing is `PUT /admin/orders/:id/status`. The admin UI only ever offers the
single next step, and `delivered` additionally stamps `deliveredAt`.

Off-path terminal states: `cancelled`, `refunded`.

## What writes `statusHistory`

Every transition is recorded — this was already correct before this change, it
simply had no UI:

| Event | Written by |
| --- | --- |
| Order placed | `orders.route.js` (on create) |
| Customer cancels | `orders.route.js` |
| Admin advances status | `admin.route.js` `/status` |
| Admin cancels | `admin.route.js` `/cancel` |
| Admin refunds | `admin.route.js` `/refund` |

Each entry holds `{ status, note, timestamp, updatedBy }`. `GET /admin/orders/:id`
now populates `statusHistory.updatedBy` so the timeline can name the person
rather than print an ObjectId.

## Stock and points

- **Cancel** restores stock for every line, refunds `pointsUsed`, and reverses
  `pointsEarned`.
- **Refund** restores stock, reverses `pointsEarned`, and sets
  `paymentStatus: 'refunded'`.

---

## Gaps found (not fixed — each needs a product decision)

### 1. `returned` is unreachable
`ORDER_STATUS` includes `returned`, but nothing ever sets it and no UI offers
it. Either build returns or drop the enum member.

### 2. `returnRequest` is dead schema
`order.returnRequest` (`requestedAt`, `reason`, `status`, `refundAmount`) is
defined on the model and **never read or written anywhere in the codebase**.
Confirmed by grep: the only hit is the schema definition itself. It implies a
returns flow that does not exist.

### 3. A cancelled order can be refunded, restoring stock twice
`/cancel` refuses to run when status is already `delivered`/`cancelled`/`refunded`.
`/refund` only guards on `paymentStatus === 'refunded'`. A cancelled order has
`paymentStatus: 'pending'`, so refunding it passes the guard and calls
`restoreStock` a second time — inflating inventory.

Not currently reachable through the admin UI (the Refund button only renders for
`delivered`), but the endpoint is exposed and any direct call hits it.

*Suggested fix:* guard `/refund` on `order.status` the way `/cancel` does.

### 4. COD orders are never marked paid
`paymentStatus` is only ever assigned in one place — `/refund`. The store is
COD-only, so cash changes hands at `delivered`, but nothing sets
`paymentStatus: 'paid'`. Every fulfilled order sits at `pending` forever, which
makes payment status useless for reconciliation.

*Suggested fix:* set `paymentStatus = 'paid'` when a COD order reaches
`delivered`.

### 5. Status transitions aren't validated as transitions
`/status` validates only that the value is one of the five flow states. Nothing
stops `placed → delivered` directly, or `shipped → placed` backwards. The admin
UI is well-behaved, so this only matters for direct API calls.

### 6. The admin orders list has no pagination
`GET /admin/orders` is a hardcoded `.limit(200)` with no `page`/`total`. Once
the store passes 200 orders the oldest silently become invisible in the admin.
This is the same problem just fixed on the books list.
