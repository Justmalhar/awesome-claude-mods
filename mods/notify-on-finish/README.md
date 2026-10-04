# Notify on Finish

Sends a desktop notification when a long turn finishes, titled with the repo or folder name and carrying the first ~100 characters of Claude's answer.

## What this shows
A `turn.complete` hook that reads `durationMs`, `isAborted` and `agentId`, and shells out through `$.process.run` with argv only (no shell). The notification text travels as AppleScript `argv` items, so quotes, backslashes and newlines never become code.

## Demo
Not captured: a notification banner can't be seen in `claude -p`. The argv the mod builds was run directly with `osascript` on macOS and raised a banner.

## How it works
- Ignores subagent turns (`e.agentId`), aborted turns, and turns at or under `threshold_seconds`.
- Detects the OS once with `uname -s`: `Darwin` uses `osascript`, `Linux` uses `notify-send`, anything else (or a failed `uname`) uses `$.ui.toast`.
- Title: basename of `$.session.cwd()`. Body: the answer with whitespace collapsed, cut at 100 characters; an empty answer gives `Finished in Ns`.
- Never throws and always calls `next(e)`; a failed notification command is swallowed.

```
hooks: turn.complete
calls: $.process.run, $.session.cwd, $.ui.toast
```

## Run it
Requires a Claude Code version with mods. On macOS nothing else is needed; on Linux install `notify-send` (libnotify).

```
claude --plugin-dir ./mods/notify-on-finish
```

Config (`userConfig`):

| Key | Default | Meaning |
|-----|---------|---------|
| `threshold_seconds` | `20` | Notify only when the turn took longer. Non-numeric falls back to 20. |
| `sound` | empty | macOS sound name (`Glass`, `Ping`, ...). Empty is silent. |

## Notes / limitations
- `only_when_unfocused` (skip the notification while the terminal is focused) is out of scope: the mods API has no focus signal.
- macOS banners are attributed to Script Editor, and need notifications allowed for it in System Settings.
- Windows has no native path; it gets the in-app toast.
- Only the main loop notifies; subagent completions are ignored.
- The official test kit loads the mod with default options only, so `sound` and a custom threshold are not covered by tests.
- Does not use the `AbovePrompt` band.

## Dependencies
None.
