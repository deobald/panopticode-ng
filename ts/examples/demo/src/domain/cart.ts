export interface Item { price: number; quantity: number }

export function subtotal(items: Item[]): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}

export function discount(total: number, member: boolean, code?: string): number {
  if (code === 'WELCOME' && total > 50) return total * 0.15;
  if (member) return total * 0.1;
  return 0;
}

export function shipping(total: number, country: string, express: boolean): number {
  if (total > 100 && country === 'CA') return 0;
  switch (country) {
    case 'CA': return express ? 15 : 5;
    case 'US': return express ? 25 : 10;
    default: return express ? 50 : 30;
  }
}
