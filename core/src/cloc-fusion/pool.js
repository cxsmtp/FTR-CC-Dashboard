// From cloc-fusion 1.4.2 (commit f51db42fc68c), MIT licence; this product's own copy.
/** Run `fn(item, index)` over `items` with at most `n` running at a time. */
export async function pool(items, n, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}
