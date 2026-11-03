interface Order {
  items: { sku: string; quantity: number; price: number }[];
  email?: string;
  address?: string;
  country?: string;
  member?: boolean;
  code?: string;
  express?: boolean;
  currency?: string;
  retries?: number;
}

// Deliberately branch-heavy fixture to make the treemap's warning bands visible.
export function validateCheckout(order: Order): string[] {
  const errors: string[] = [];
  if (!order.email || !order.email.includes('@')) errors.push('Email required');
  if (!order.address || order.address.length < 8) errors.push('Address required');
  if (!order.items || order.items.length === 0) errors.push('Cart empty');
  if (!order.country) errors.push('Country required');
  for (const item of order.items) {
    if (!item.sku || item.sku.length < 3) errors.push('Invalid SKU');
    if (item.quantity < 1 || item.quantity > 100) errors.push('Invalid quantity');
    if (item.price < 0 || !Number.isFinite(item.price)) errors.push('Invalid price');
  }
  if (order.code && !order.member) errors.push('Code requires membership');
  if (order.express && order.country !== 'CA') errors.push('Express unavailable');
  if (order.currency !== 'CAD' && order.currency !== 'USD') errors.push('Currency unavailable');
  if ((order.retries ?? 0) > 3) errors.push('Too many retries');
  return errors;
}

export async function submit(order: Order, send: (order: Order) => Promise<string>): Promise<string> {
  const errors = validateCheckout(order);
  if (errors.length) throw new Error(errors.join(', '));
  try {
    return await send(order);
  } catch (error) {
    if (order.retries && order.retries > 2) throw error;
    return 'Please retry';
  }
}
