// The production scheduler runs unchanged; only time and persistence are synthetic.
export function virtualPacer(Reddit, options = {}) {
  let now = 0;
  const values = new Map();
  return new Reddit.RequestPacer({
    now: () => now,
    sleep: async ms => { now += ms; },
    store: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) },
    lockManager: null,
    ...options
  });
}
