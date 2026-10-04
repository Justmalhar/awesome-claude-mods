// A stand-in for Claude Code, so a mod's hooks can be tested with `node --test`.
//
// An approximation, not the real host: events run through matching handlers in
// registration order, `next(e)` calls the following handler, and `$` records the
// calls a test usually asserts on. Extend `$` here when a mod needs more of it.

export function mockHost() {
  const handlers = [];
  const calls = { toast: [] };
  const $ = {
    ui: { toast: (m) => calls.toast.push(m), invalidate() {} },
    session: { cwd: async () => "/work" },
    clock: { now: async () => Date.now(), sleep: async () => {} },
  };
  const on = (name, a, b) => {
    const [filter, fn] = typeof a === "function" ? [{}, a] : [a, b];
    handlers.push({ name, filter, fn });
  };
  /** Fire an event; resolves to what the first handler chain returns. */
  async function emit(name, e) {
    const chain = handlers.filter((h) => h.name === name && Object.entries(h.filter).every(([k, v]) => e[k] === v));
    const run = (i, ev) =>
      i === chain.length ? ev : chain[i].fn($, ev, (n) => run(i + 1, n ?? ev));
    return run(0, e);
  }
  return { on, emit, calls };
}
