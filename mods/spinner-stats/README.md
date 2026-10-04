# Spinner Stats

Adds live stats to Claude Code's own spinner without replacing it: `Sauteing… · 12s · Bash · 4 calls`.

## What this shows
`ui.render` on the `Spinner` site, rewriting `props.suffix` so it composes with other mods' suffixes; a `$.clock.every` redraw; `tool.call` wrapped around `await next(e)` to know when a tool is running.

## Demo
Not captured live: the spinner only draws in an interactive terminal session, and `claude -p` can't show it. Covered by `$.ui.mount` tests (`claude plugin test`), not by a screenshot.

## How it works
- `session.start` starts a 1 s timer that refreshes the elapsed seconds and invalidates `ui.render`, only while a turn runs.
- `turn.start` records the start time (`$.clock.now()`) and resets the call count and running tools.
- `tool.call` adds the tool to a running list, bumps the count, runs `await next(e)`, then removes it (a list, so concurrent calls work; the newest running tool is shown).
- `turn.complete` stops the stats.
- `ui.render {component: "Spinner"}` appends ` · <elapsed>s · <tool> · <n> calls` to the existing suffix. Any throw falls back to `next(e)`, so the spinner is never broken.

Main loop only: `tool.call`s with an `agentId` (subagents) are not counted, so the numbers describe what you are waiting on in this turn.

What `claude plugin validate` reports:

```
hooks: session.start, turn.start, tool.call, turn.complete, ui.render{component=Spinner}
calls: $.clock.every, $.clock.now, $.ui.invalidate
```

## Run it
Claude Code with mods support (2.1.289+). `claude --plugin-dir ./mods/spinner-stats`, or install from the marketplace.

## Notes / limitations
- Spinner is drawn on the terminal surface only; nothing shows in the Desktop Code tab, VS Code, `-p` or cloud.
- Output tokens/sec is omitted: `turn.step` reports usage only when a step ends, so a rate would mix model time with tool wait time.
- The 1 s timer is never cancelled; it does nothing outside a turn.
- Does not use the `AbovePrompt` band, so it coexists with other mods that do.
- Not verified in a live interactive session.

## Dependencies
None.
