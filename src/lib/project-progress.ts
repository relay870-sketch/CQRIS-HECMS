export interface ProgressItem { total_qty: number; completed_qty: number; unit_price: number }

export function calculateProjectProgress(items: ProgressItem[], fallbackProgress: number) {
  const pricedItems = items.filter((item) => item.total_qty > 0 && item.unit_price > 0);
  const pricingComplete = items.length > 0 && pricedItems.length === items.length;
  if (!pricingComplete) return { progress: fallbackProgress, progress_source: 'pending_prices' as const, pricing_complete: false };
  const contractAmount = pricedItems.reduce((sum, item) => sum + item.total_qty * item.unit_price, 0);
  const completedAmount = pricedItems.reduce((sum, item) => sum + Math.min(Math.max(item.completed_qty, 0), item.total_qty) * item.unit_price, 0);
  return { progress: contractAmount > 0 ? Math.round(completedAmount / contractAmount * 1000) / 10 : 0, progress_source: 'contract_value' as const, pricing_complete: true };
}
