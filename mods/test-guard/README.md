# Test Guard

Refuses a `Write`, `Edit`, `MultiEdit` or `Bash` call that would make a failing test "pass" by weakening it. Claude gets the reason and is told to fix the code, or ask you if the test is obsolete.

## What this shows

A `tool.call` guard that compares old and new text, reads the existing file with `$.fs`, and fails closed with `.catch`.

## What it catches

Only files that look like tests: `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.py`, `*_test.go`, or anything under `__tests__/`, `tests/`, `spec/`.

| Detection | Rule |
|---|---|
| Skip/only marker | `.skip(`, `.only(`, `xit(`, `xdescribe(`, `it.todo`, `test.todo`, `@pytest.mark.skip`, `@unittest.skip`, `t.Skip(`, `pending(` appears more often in the new text than the old |
| Fewer assertions | count of `expect(`, `assert`, `.should`, `t.Error`, `t.Fatal`, `require.` drops. `Edit`: old vs new string. `MultiEdit`: summed over edits. `Write`: existing file vs new content |
| Gutted file | a `Write` leaves fewer than half of the existing lines |
| Deleted test | `rm`, `git rm` or `git checkout --` naming a test file |

Not flagged: renaming a test, adding tests or assertions, editing non-test files, creating a new test file, an `.skip` that was already there.

## Demo

Headless `claude -p` (Haiku, `acceptEdits`) in a throwaway dir, asked to change `test('adds'` to `test.skip('adds'` in a failing `foo.test.js`. The edit was refused, the file is unchanged, and Claude relayed:

```
Test Guard blocked this Edit call: it adds skip/only marker(s) .skip(. Fix the code under test so the existing test passes, do not change the test to fit the code.
```

## How it works

One `tool.call` hook. For a test file it builds the before and after text, runs the checks above, and returns `{ deny }` listing what it found in plain words, or calls `next(e)`. A `Write` to a path that doesn't exist yet is allowed. If the hook throws (for example the file is over the 4 MiB read cap) the `.catch` denies.

What `claude plugin validate` reports:

```
hooks: tool.call
calls: $.fs.exists (via checkEdit), $.fs.read (via checkEdit)
```

## Run it

Requires Claude Code 2.1.289 or later.

```bash
claude --plugin-dir ./mods/test-guard        # one session
claude plugin marketplace add justmalhar/awesome-claude-mods
claude plugin install test-guard@awesome-claude-mods --scope user
```

Test it: `claude plugin test mods/test-guard`. The block was also checked once in a live headless session (see Demo).

## Notes / limitations

- A heuristic on substrings, not a parser. It misses a looser matcher, a mocked-out subject, a commented-out block that keeps the token count equal, or a skip written some other way.
- Zero tolerance on assertions: removing a genuinely duplicate assertion is flagged too. Claude is told to ask you.
- Counts are per call. Several small edits that each keep the count equal can still drift, and `Edit` only sees the replaced snippet.
- Bash detection splits on whitespace per `;`, `&`, `|` segment: quoted paths with spaces, globs and `$(...)` aren't understood, and a script that deletes tests isn't seen.
- Nothing stops Claude working around a denial (for example via `sed -i`). It is a safety net, not a permission system.

## Dependencies

None.
