// Cost Bar: one AbovePrompt row with session cost, plan limits and a budget bar.
//
// turn.complete and session.measure read $.session.usage() into `usage`, then
// invalidate; ui.render only formats it (no host calls while drawing).
// Layout when composing: [other mods' band, this band] (ours is the bottom row).

let usage = null; // module state; resets on reload
let budget = 0;   // USD, 0 = no budget

const LABEL = { five_hour: "5h", seven_day: "7d", spend_limit: "spend" };

async function refresh($) {
  try {
    usage = await $.session.usage();
    $.ui.invalidate("ui.render");
  } catch {} // keep the last reading; a refresh must never break the turn
}

// Budget bar: { color, text } for usd spent of budget, or null with no budget.
export function meter(usd, budget) {
  if (!(budget > 0) || typeof usd !== "number") return null;
  const pct = (usd / budget) * 100;
  const filled = Math.min(10, Math.round(pct / 10));
  return {
    color: pct >= 90 ? "red" : pct >= 70 ? "yellow" : "green",
    text: "█".repeat(filled) + "░".repeat(10 - filled) + ` ${Math.round(pct)}%`,
  };
}

export function register(on, options) {
  const n = parseFloat(options?.budget_usd);
  budget = n > 0 ? n : 0; // ponytail: read once at load, reload the mod after changing it

  on("turn.complete", async ($, e, next) => {
    await refresh($);
    return next(e);
  });

  on("session.measure", async ($, e, next) => {
    await refresh($);
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const theirs = await next(e);
    try {
      if (!usage) return theirs; // nothing read yet: draw nothing
      const { Box, Text } = $.ui.resolve(e);
      const parts = [];
      const usd = usage.cost?.usd;
      const m = meter(usd, budget);
      const color = m?.color;
      if (typeof usd === "number") parts.push(Text({ key: "cost", color, children: `$${usd.toFixed(2)}` }));
      if (m) parts.push(Text({ key: "bar", color, children: m.text }));
      const limits = (usage.rateLimits ?? [])
        .map((r) => `${LABEL[r.kind] ?? r.kind} ${Math.round(r.percentUsed)}%`)
        .join(" · ");
      if (limits) parts.push(Text({ key: "limits", dimColor: true, children: limits }));
      if (!parts.length) return theirs;
      const mine = Box({ key: "cost-bar", flexDirection: "row", columnGap: 2, children: parts });
      return theirs ? Box({ flexDirection: "column", children: [theirs, mine] }) : mine;
    } catch {
      return theirs; // a draw hook must never throw
    }
  });
}
