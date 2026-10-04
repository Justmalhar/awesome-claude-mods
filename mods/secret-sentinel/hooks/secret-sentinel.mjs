// Secret Sentinel: refuses a tool call that would write a secret into a file or a command.
//
// tool.call (Write, Edit, MultiEdit, Bash): scan the text Claude is about to
// write or run. On a match, deny with a reason Claude can act on. No UI, no
// state: the only host call is a toast.
//
// The host reads `on(...)` and `$.noun.method(...)` from source, so they are
// spelled literally.

const MAX_SCAN = 1_000_000; // ponytail: only the first 1 MB is scanned, raise it if a real file needs more
const ALLOW_MARK = "secret-sentinel:allow";
const TEMPLATE_FILE = /\.(example|sample|template)$/;
const TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);

// Provider formats: precise enough to block without a second opinion.
// Order matters: Anthropic keys also match the broader OpenAI shape.
const RULES = [
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Stripe live key", /\b[sr]k_live_[A-Za-z0-9]{20,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
];

// `api_key = "..."`, `"password": "..."`: only when the value looks random.
const GENERIC = /(?:api[_-]?key|secret|token|passw(?:or)?d)\w*["']?\s*[:=]\s*["']([^"'\s]{16,})["']/i;
const PLACEHOLDER = /example|placeholder|your[_-]|changeme|xxx|<[^>]+>|\$\{|process\.env|os\.environ/i;
const MIN_ENTROPY = 3.5; // bits per character; english words sit near 2.5-3

export function register(on) {
  on("tool.call", async ($, e, next) => {
    if (!TOOLS.has(e.tool) || TEMPLATE_FILE.test(String(e.file_path ?? ""))) {
      return next(e);
    }
    const hits = scan(textOf(e));
    if (hits.length === 0) {
      return next(e);
    }
    try {
      $.ui.toast(`Secret Sentinel blocked ${e.tool}: ${hits[0].label}`);
    } catch {
      // a toast is a courtesy; the denial below is what matters
    }
    const found = hits.map((h) => `${h.label} (${h.redacted}, line ${h.line})`).join("; ");
    return {
      deny:
        `Secret Sentinel blocked this ${e.tool} call: it contains ${found}. ` +
        `Do not put secrets in files or commands. Read the value from an environment variable ` +
        `(a git-ignored .env file) instead, and ask the user to supply it. ` +
        `If the user confirms it is a false positive, add "${ALLOW_MARK}" on that line.`,
    };
  });
}

/** The new text a tool call would write or run. */
function textOf(e) {
  return [e.command, e.content, e.new_string, ...(Array.isArray(e.edits) ? e.edits.map((x) => x.new_string) : [])]
    .filter((s) => typeof s === "string")
    .join("\n")
    .slice(0, MAX_SCAN);
}

/** Up to three { label, redacted, line } findings. */
function scan(text) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && hits.length < 3; i += 1) {
    const line = lines[i];
    if (line.includes(ALLOW_MARK)) {
      continue;
    }
    const hit = matchLine(line);
    if (hit !== null) {
      hits.push({ ...hit, line: i + 1 });
    }
  }
  return hits;
}

function matchLine(line) {
  for (const [label, re] of RULES) {
    const m = re.exec(line);
    if (m !== null) {
      return { label, redacted: redact(m[0]) };
    }
  }
  const g = GENERIC.exec(line);
  if (g !== null && !PLACEHOLDER.test(line) && entropy(g[1]) >= MIN_ENTROPY) {
    return { label: "hard-coded credential", redacted: redact(g[1]) };
  }
  return null;
}

// The reason goes back to the model and the transcript, so never echo the secret.
function redact(value) {
  return `${value.slice(0, 4)}…, ${value.length} chars`;
}

function entropy(s) {
  const counts = new Map();
  for (const ch of s) {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let h = 0;
  for (const n of counts.values()) {
    h -= (n / s.length) * Math.log2(n / s.length);
  }
  return h;
}
