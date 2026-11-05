/** Balanced binary treemap. Each output rectangle has area proportional to weight. */
export function partition(items, bounds) {
  if (!items.length) return [];
  if (items.length === 1) return [{ item: items[0], ...bounds }];
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let sum = 0;
  let split = 1;
  let best = Infinity;
  for (let i = 1; i < items.length; i++) {
    sum += items[i - 1].weight;
    const distance = Math.abs(total / 2 - sum);
    if (distance < best) { best = distance; split = i; }
  }
  const first = items.slice(0, split);
  const fraction = first.reduce((value, item) => value + item.weight, 0) / total;
  const { x, y, width, height } = bounds;
  if (width >= height) {
    const cut = width * fraction;
    return [...partition(first, { x, y, width: cut, height }),
      ...partition(items.slice(split), { x: x + cut, y, width: width - cut, height })];
  }
  const cut = height * fraction;
  return [...partition(first, { x, y, width, height: cut }),
    ...partition(items.slice(split), { x, y: y + cut, width, height: height - cut })];
}
