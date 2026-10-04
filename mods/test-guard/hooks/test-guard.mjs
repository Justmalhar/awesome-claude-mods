// Test Guard: refuses a tool call that makes a failing test "pass" by weakening it.
//
// tool.call (Write, Edit, MultiEdit, Bash): for a test file, compare old and new
// text for new skip/only markers, fewer assertions, or a Write that gutted the
// file; refuse `rm` / `git rm` / `git checkout --` of a test file.
//
// ponytail: substring heuristics, not a parser. It cannot see a test that is
// weakened semantically (a looser matcher, a mocked-out subject, a commented-out
// block that keeps the token count equal). Upgrade path: AST diff per language.
// The host reads `on(...)` and `$.noun.method(...)` from source: spelled literally.

const TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);
const SKIPS = [
  ".skip(", ".only(", "xit(", "xdescribe(", "it.todo", "test.todo",
  "@pytest.mark.skip", "@unittest.skip", "t.Skip(", "pending(",
];
const ASSERTS = ["expect(", "assert", ".should", "t.Error", "t.Fatal", "require."];
const TEST_DIRS = new Set(["__tests__", "tests", "spec"]);
const MAX_LINES_LOST = 0.5; // a Write may drop at most half of the existing lines

export function register(on) {
  on("tool.call", async ($, e, next) => {
    if (!TOOLS.has(e.tool)) {
      return next(e);
    }
    const found = e.tool === "Bash" ? checkBash(e.command) : await checkEdit($, e);
    if (found.length === 0) {
      return next(e);
    }
    return {
      deny:
        `Test Guard blocked this ${e.tool} call: ${found.join("; ")}. ` +
        `Fix the code under test so the existing test passes, do not change the test to fit the code. ` +
        `If the test is genuinely obsolete or wrong, ask the user first and let them decide.`,
    };
  }).catch(async () => ({
    // fail closed: a skipped guard would let the weakened test through
    deny: "Test Guard failed while checking this call, so it was not run. Do not retry it unless the user asks you to.",
  }));
}

/** True for paths that look like a test file or live in a test directory. */
function isTestPath(path) {
  const parts = String(path).split("/");
  const base = parts[parts.length - 1];
  return (
    base.includes(".test.") || base.includes(".spec.") ||
    (base.startsWith("test_") && base.endsWith(".py")) ||
    base.endsWith("_test.py") || base.endsWith("_test.go") ||
    parts.slice(0, -1).some((p) => TEST_DIRS.has(p))
  );
}

/** Plain-words findings for a Write/Edit/MultiEdit; [] means allow. */
async function checkEdit($, e) {
  if (typeof e.file_path !== "string" || !isTestPath(e.file_path)) {
    return [];
  }
  let before;
  let after;
  let wholeFile = false;
  if (e.tool === "Write") {
    // a new file has nothing to weaken; 4 MiB read cap overflow throws and fails closed
    if (!(await $.fs.exists(e.file_path))) {
      return [];
    }
    before = await $.fs.read(e.file_path);
    after = String(e.content ?? "");
    wholeFile = true;
  } else if (e.tool === "MultiEdit") {
    const edits = Array.isArray(e.edits) ? e.edits : [];
    before = edits.map((x) => String(x.old_string ?? "")).join("\n");
    after = edits.map((x) => String(x.new_string ?? "")).join("\n");
  } else {
    before = String(e.old_string ?? "");
    after = String(e.new_string ?? "");
  }
  return compare(before, after, wholeFile);
}

/** Findings for before -> after text. Pure. */
function compare(before, after, wholeFile) {
  const found = [];
  const skips = SKIPS.filter((m) => count(after, m) > count(before, m));
  if (skips.length > 0) {
    found.push(`it adds skip/only marker(s) ${skips.join(", ")}`);
  }
  const was = total(before, ASSERTS);
  const now = total(after, ASSERTS);
  // ponytail: zero tolerance, so even a deliberately removed duplicate assertion is flagged
  if (now < was) {
    found.push(`it lowers the assertion count from ${was} to ${now}`);
  }
  if (wholeFile) {
    const oldLines = before.split("\n").length;
    const newLines = after.split("\n").length;
    if (newLines < oldLines * MAX_LINES_LOST) {
      found.push(`it shrinks the file from ${oldLines} to ${newLines} lines`);
    }
  }
  return found;
}

/** Findings for a Bash command: rm / git rm / git checkout -- on a test file. */
function checkBash(command) {
  const found = [];
  // ponytail: whitespace split; quoted paths with spaces and `$(...)` are not understood
  for (const segment of String(command ?? "").split(/[;&|\n]+/)) {
    const t = segment.trim().split(/\s+/);
    const destructive =
      t[0] === "rm" || (t[0] === "git" && t[1] === "rm") || (t[0] === "git" && t[1] === "checkout" && t.includes("--"));
    if (destructive) {
      for (const arg of t.slice(1)) {
        if (!arg.startsWith("-") && isTestPath(arg)) {
          found.push(`it deletes or reverts the test file ${arg}`);
        }
      }
    }
  }
  return found;
}

function count(text, token) {
  let n = 0;
  for (let i = text.indexOf(token); i !== -1; i = text.indexOf(token, i + token.length)) {
    n += 1;
  }
  return n;
}

function total(text, tokens) {
  return tokens.reduce((sum, t) => sum + count(text, t), 0);
}
