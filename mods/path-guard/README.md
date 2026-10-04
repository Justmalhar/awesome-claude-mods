# Path Guard

Refuses a `Write`, `Edit` or `MultiEdit` call whose `file_path` resolves outside the project root or into `.git`. Claude gets the reason and is told to stay inside the project or ask you.

## What this shows
A `tool.call` guard that resolves a path in plain JS (no path module in a mod): `~`, relative paths, `.` and `..`, compared against `$.session.repo()?.root ?? $.session.cwd()`. It also shows `userConfig` driving a hook, and a `.catch` that fails closed.

## Rules

| Rule | Default |
|---|---|
| Path resolves outside the project root | denied |
| Any `.git` path segment (writes only) | denied |
| `deny_globs` match | none |
| `allow_outside` dirs | none |
| `guard_reads` | off (`Read` unchecked) |

Relative paths resolve against the session cwd, then `.` and `..` fold (`..` never climbs above `/`). `~` and `~/…` expand to `$HOME`. `./a/../../x` and `/proj/src/../../../etc/passwd` are caught because the check runs on the folded path. The root test is `abs === root || abs.startsWith(root + "/")`, so `/work/proj-evil` is not inside `/work/proj`.

## Config

Set with `/config` or `pluginConfigs` in `settings.json`.

| Key | Type | Meaning |
|---|---|---|
| `deny_globs` | string | Comma-separated globs, e.g. `**/*.lock,infra/**`. `**` any depth, `*` within a segment, `?` one character. No `/` in the pattern: matches at any depth. With a `/`: anchored to the project root, or to `/` when it starts with one. A matched directory covers what is under it. |
| `allow_outside` | string | Comma-separated absolute directories (`~` allowed) that may be written outside the root, e.g. `/tmp`. `.git` and `deny_globs` still apply there (globs match the absolute path). |
| `guard_reads` | boolean | Apply the outside-root and glob rules to `Read` too. `.git` stays readable. |

## Demo

Headless `claude -p --model haiku --permission-mode acceptEdits`, project in a temp dir, asked to write a file in a sibling dir and then `ok.txt` in the project. The outside write was refused and nothing was created there. `ok.txt` was written. Claude relayed that the path resolves outside the project root. The model made the call; the hook did the refusing.

The deny text:

```
Path Guard blocked this Write call: "<path>" resolves to <abs>, which is outside the project root. Stay inside the project (<root>) and do not write into .git. If the user really wants this path, ask them to allow it (the allow_outside or deny_globs setting) instead of retrying.
```

## How it works

One `tool.call` hook. It reads the repo root (falls back to cwd) and `HOME`, normalises `file_path`, then checks in order: outside the root (unless under an `allow_outside` dir), `.git` segment, `deny_globs`. A hit returns `{ deny }`; otherwise `next(e)`. A failure in the hook itself denies the call.

What `claude plugin validate` reports:

```
hooks: tool.call
calls: $.env.get, $.session.cwd, $.session.repo
```

## Run it

Requires Claude Code 2.1.287 or later.

```bash
claude --plugin-dir ./mods/path-guard        # one session
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install path-guard@awesome-claude-mods --scope user
```

Test it: `claude plugin test mods/path-guard`. The kit cannot set `userConfig`, so the option rules are tested by calling `register()` directly with an options object. The default behaviour was also checked once in a live headless session (see Demo); the config options were not.

## Notes / limitations

- **Bash is out of scope.** `echo x > /etc/y`, `cp`, `sed -i` and scripts bypass it. Pair it with a Bash guard (for example `shell-guard` or `sensitive-file-guard`) or a sandbox.
- **Lexical only.** Symlinks are not followed: a symlink inside the project pointing outside passes. Case is compared as-is, so on case-insensitive macOS `/Work/Proj` is seen as outside `/work/proj`; that fails closed.
- Only `file_path` is checked. `NotebookEdit` (`notebook_path`) and MCP tools that write files are not covered.
- `.git` is matched as any path segment, so a nested repo's `.git` is protected too, and so is a directory literally named `.git`.
- Globs have no `[...]` or `{a,b}`; they match literally. Commas cannot appear inside a pattern.
- Without a repo, the session cwd is the root. If the cwd is a subdirectory of a repo, the repo root wins.
- Paths with a `~user` prefix are treated as relative names.

## Dependencies

None.
