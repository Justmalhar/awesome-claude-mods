# Secret Guard

Refuses a `Write`, `Edit`, `MultiEdit` or `Bash` call that would put an API key, token or private key into a file or a command. Claude gets the reason and is told to use an environment variable instead.

## What it catches

| Kind | Example shape |
|---|---|
| AWS access key | `AKIA…`, `ASIA…` + 16 chars |
| GitHub token | `ghp_…`, `gho_…`, `github_pat_…` |
| Anthropic / OpenAI key | `sk-ant-…`, `sk-…`, `sk-proj-…` |
| Slack, Stripe live, Google API key | `xoxb-…`, `sk_live_…`, `AIza…` |
| Private key | `-----BEGIN … PRIVATE KEY-----` |
| Hard-coded credential | `api_key = "…"`, `"password": "…"` when the value looks random (entropy ≥ 3.5 bits/char) and isn't a placeholder |

The denial names the kind, the line, and the first four characters of the match. It never repeats the secret, so it stays out of the transcript.

## Demo

Headless `claude -p` with the mod loaded, asked to write `const awsKey = "AKIA…"` to `config.js`. The write was refused, no file was created, and Claude relayed:

```
Secret Guard blocked this Write call: it contains AWS access key (AKIA…, 20 chars, line 1). Do not put secrets in files or commands. Read the value from an environment variable (a git-ignored .env file) instead, and ask the user to supply it. If the user confirms it is a false positive, add "secret-guard:allow" on that line.
```

Claude then asked before retrying with the allow marker.

## How it works

One `tool.call` hook. It joins the text the call would write or run (`command`, `content`, `new_string`, each `edits[].new_string`), scans line by line, and returns `{ deny }` on a match. Otherwise it calls `next(e)`.

What `claude plugin validate` reports:

```
hooks: tool.call
calls: $.ui.toast
```

No file, process or network access.

## Run it

Requires Claude Code 2.1.287 or later.

```bash
claude --plugin-dir ./mods/secret-guard        # one session
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install secret-guard@awesome-claude-mods --scope user
```

Test it: `npm test`. The tests run with `claude plugin test`, not in a live session. The block was also checked once in a live headless session (see Demo).

## Notes / limitations

- Pattern matching, not a secret scanner. It misses secrets split across lines or strings, base64-wrapped values, and formats it has no rule for. Use `gitleaks` or push protection as the real gate.
- A line containing `secret-guard:allow` is skipped. Claude can add the marker itself, and the denial tells it to ask the user first, but nothing enforces that. This is a safety net, not a permission system.
- Files ending in `.example`, `.sample` or `.template` are not scanned.
- It reads only what Claude writes or runs. A secret that is already in a file, or that a script prints, isn't seen.
- Only the first 1 MB of a call is scanned, and the first three findings are reported.
- The generic rule can flag a real-looking test fixture. Mark it `secret-guard:allow`.

## Dependencies

None.
