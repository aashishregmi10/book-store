// NPR is stored as integer rupees. Format with Indian-style grouping.
export function npr(amount: number): string {
  return `NPR ${Number(amount || 0).toLocaleString("en-IN")}`;
}

export function discountPct(price: number, comparePrice?: number): number {
  if (!comparePrice || comparePrice <= price) return 0;
  return Math.round(((comparePrice - price) / comparePrice) * 100);
}
