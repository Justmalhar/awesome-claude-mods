// Spinner Stats: appends " · 12s · Bash · 4 calls" to Claude Code's own spinner.
//
// turn.start resets, tool.call tracks the running tool(s) and the call count,
// a 1 s timer refreshes the elapsed time, and ui.render {Spinner} adds to the
// suffix (it composes with other mods' suffixes).
//
// Main loop only: tool calls with `agentId` (subagents) are not counted, so the
// numbers describe what the person is waiting on in this turn, not fan-out work.
//
// The host reads `on(...)` and `$.noun.method(...)` from source: spelled literally.

let startedAt = null; // ms, set while a turn runs
let elapsedS = 0;
let calls = 0;
let running = []; // names of in-flight main-loop tools (concurrent calls)

export function register(on) {
  on("session.start", async ($, e, next) => {
    // ponytail: the timer is never cancelled; it only invalidates while a turn runs
    $.clock.every(1000, async () => {
      try {
        if (startedAt === null) return;
        elapsedS = Math.floor(((await $.clock.now()) - startedAt) / 1000);
        $.ui.invalidate("ui.render");
      } catch {
        // a missed tick just means a stale second
      }
    });
    return next(e);
  });

  on("turn.start", async ($, e, next) => {
    try {
      startedAt = await $.clock.now();
      elapsedS = 0;
      calls = 0;
      running = [];
      $.ui.invalidate("ui.render");
    } catch {
      startedAt = null;
    }
    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    if (e.agentId) return next(e);
    running.push(e.tool);
    calls++;
    try {
      $.ui.invalidate("ui.render");
    } catch {
      // cosmetic
    }
    try {
      return await next(e);
    } finally {
      const i = running.indexOf(e.tool);
      if (i >= 0) running.splice(i, 1);
    }
  });

  on("turn.complete", async ($, e, next) => {
    if (!e.agentId) startedAt = null; // the timer goes quiet; the spinner is gone anyway
    return next(e);
  });

  on("ui.render", { component: "Spinner" }, async ($, e, next) => {
    try {
      if (startedAt === null) return next(e);
      const parts = [`${elapsedS}s`];
      if (running.length) parts.push(running[running.length - 1]);
      if (calls) parts.push(`${calls} ${calls === 1 ? "call" : "calls"}`);
      return next({ ...e, props: { ...e.props, suffix: (e.props.suffix ?? "") + " · " + parts.join(" · ") } });
    } catch {
      return next(e);
    }
  });
}
// ponytail: output tokens/sec omitted. turn.step only reports usage when a step ends, so a rate would be
// a per-step average mixed with tool wait time; add it if the host streams usage mid-step.
