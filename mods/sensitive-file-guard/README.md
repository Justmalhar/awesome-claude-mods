# Sensitive File Guard

Refuses Read, Write, Edit, MultiEdit, Grep, Glob and Bash calls that touch `.env` files, private keys or credential stores, and tells Claude to ask you for the one non-secret value it needs.

## What this shows
A fail-closed `tool.call` guard that matches path strings only (no host calls), including a small quote-aware Bash tokenizer.

## Demo
`claude -p` with a fabricated `.env` (`FOO=bar`), asking Claude to read it:

```
Sensitive File Guard blocked this Read call: it touches a file matching ".env", which may hold secrets. Do not read, copy or modify it.
```

## How it works
One `tool.call` hook on the tools above. Paths come from `file_path`, `path` (and `pattern` for Glob). For Bash, `command` is split into words (quotes stripped, split on whitespace and `<>|;&()=`), and every word is tested. Matched patterns: `.env` and `.env.*` (except `.example`, `.sample`, `.template`, `.dist`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`/`id_ed25519*`/`id_ecdsa*` (not `.pub`), anything under `.ssh/`, `.aws/`, `.gnupg/` (not `.pub`), `.kube/config`, `.npmrc`, `.netrc`, `.pypirc`, `.docker/config.json`, `credentials`, `credentials.json`, Keychains. The deny reason names the pattern, never file contents. If the hook itself throws, the call is denied (`.catch`).

```
hooks: tool.call
calls: nothing on $
```

## Run it
```
claude --plugin-dir ./mods/sensitive-file-guard
claude plugin test mods/sensitive-file-guard
```

## Notes / limitations
- Not caught: shell indirection (`f=.e; cat ${f}nv`), `$(cat .env)`, scripts that read the file, and MCP tools.
- Bash matching is word-based, so `echo credentials` or a commit message mentioning `.env` is also blocked.
- `~` and `$HOME` are not expanded; matching uses path segment names.
- No drawing, so it does not use the `AbovePrompt` band.

## Dependencies
None.
