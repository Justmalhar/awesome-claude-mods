# Cost Bar

A one-row band above the prompt: session cost, plan-limit windows, and an optional budget bar.

```
$1.23  ███░░░░░░░ 31%  5h 42% · 7d 18%
```

## What this shows
`turn.complete` and `session.measure` refreshing module state from `$.session.usage()`, and a composing `ui.render` hook for the `AbovePrompt` band that only formats that state.

## Demo
Not captured in a live session. Drawing is covered by `$.ui.mount` tests; `claude -p` cannot show UI.

## How it works
- On `turn.complete` and `session.measure`, `await $.session.usage()` into a module variable, then `$.ui.invalidate("ui.render")`. `ui.render` never calls `usage`.
- The band shows `cost.usd` as `$1.23`, each rate-limit window as `5h 42%` / `7d 18%` (a gateway `spend_limit` as `spend`), and, when `budget_usd` is set, a 10-block bar. The cost and bar are green under 70% of budget, yellow from 70%, red from 90%.
- Nothing is drawn until the first reading. A missing `cost` hides the cost, empty `rateLimits` hide the limits, and a failed refresh keeps the last reading.
- Composing: `const theirs = await next(e)`, then a column `[theirs, ours]`, so this band is the bottom row.

What `claude plugin validate` reports:

```
hooks: turn.complete, session.measure, ui.render{component=AbovePrompt}
calls: $.session.usage (via refresh), $.ui.invalidate (via refresh), $.ui.resolve
```

Setting: `budget_usd` (string, empty = no budget), for example `5`. Read when the mod loads.

## Run it
Requires Claude Code 2.1.289 or later.

```bash
claude --plugin-dir ./mods/cost-bar        # one session
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install cost-bar@awesome-claude-mods --scope user
```

Test it: `claude plugin test mods/cost-bar`.

## Notes / limitations
- Surfaces: draws in the terminal and the Desktop Code tab. Hooks run elsewhere but nothing is shown (VS Code, `claude -p`, cloud), and there is no text fallback.
- Uses the `AbovePrompt` band. It composes with other bands, but the row order is fixed (ours last).
- The budget is a display threshold, not a limit: nothing is blocked at 100%.
- Changing `budget_usd` needs a mod reload. The first reading arrives after a turn or the first `session.measure`.
- `cost` is Claude Code's own ledger for this session. `rateLimits` is empty off a subscription.
- Tests cover the budget colours through the exported `meter()` function, not a mounted band: the test kit loads the mod with default options only. The mounted band is tested without a budget.
- Not checked in a live session.

## Dependencies
None.
