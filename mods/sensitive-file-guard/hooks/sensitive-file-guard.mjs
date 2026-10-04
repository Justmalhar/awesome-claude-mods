// Sensitive File Guard: refuses tool calls that touch .env files, private keys
// and credential stores. Pure path-string matching, no host calls.
//
// The host reads `on(...)` from source, so it is spelled literally.

const TOOLS = new Set(["Read", "Write", "Edit", "MultiEdit", "Grep", "Glob", "Bash"]);
const DIRS = [".ssh", ".aws", ".gnupg"]; // anything under these
const NAMES = [".npmrc", ".netrc", ".pypirc", "credentials", "credentials.json"];

/** The matched pattern's name, or null. `p` is one path-like string. */
function sensitive(p) {
  // ponytail: `~` and `$HOME` are not expanded; matching is on segment names, so they need no expansion
  const segs = p.replace(/\\/g, "/").toLowerCase().split("/").filter(Boolean);
  const base = segs[segs.length - 1] ?? "";
  const dir = DIRS.find((d) => segs.includes(d));
  if (dir && !base.endsWith(".pub")) return `${dir}/`; // public keys are fine
  if (base === ".env" || (base.startsWith(".env.") && !/\.(example|sample|template|dist)$/.test(base))) return ".env";
  if (/\.(pem|key|p12|pfx)$/.test(base)) return `*.${base.split(".").pop()}`;
  if (/^id_(rsa|ed25519|ecdsa)/.test(base) && !base.endsWith(".pub")) return "private SSH key";
  if (NAMES.includes(base)) return base;
  if (base === "config" && segs.includes(".kube")) return ".kube/config";
  if (base === "config.json" && segs.includes(".docker")) return ".docker/config.json";
  if (segs.some((s) => s === "keychains" || /\.keychain(-db)?$/.test(s))) return "Keychains";
  return null;
}

/** Quote-aware split on whitespace and shell operators; quotes are stripped. */
function tokenize(cmd) {
  const out = [];
  let cur = "";
  let q = null;
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else cur += c;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "\\" && i + 1 < cmd.length) cur += cmd[++i];
    else if (/[\s<>|;&()=]/.test(c)) {
      if (cur) out.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// ponytail: any word that looks like a sensitive name blocks, even in `echo credentials`
// or a commit message. Shell indirection, `$(cat .env)`, scripts and MCP tools are not caught.
function find(e) {
  const paths = [e.file_path, e.path];
  if (e.tool === "Glob") paths.push(e.pattern);
  if (e.tool === "Bash") paths.push(...tokenize(String(e.command ?? "")).flatMap((t) => [t, ...t.split(/\s+/)]));
  for (const p of paths) {
    const hit = typeof p === "string" ? sensitive(p) : null;
    if (hit) return hit;
  }
  return null;
}

export function register(on) {
  on("tool.call", async ($, e, next) => {
    if (!TOOLS.has(e.tool)) return next(e);
    const hit = find(e);
    if (hit === null) return next(e);
    return {
      deny:
        `Sensitive File Guard blocked this ${e.tool} call: it touches a file matching "${hit}", which may hold secrets. ` +
        `Do not read, copy or modify it. If you need a value from it, ask the user to paste only the specific ` +
        `non-secret value, or work from a .env.example file instead.`,
    };
  }).catch(async () => ({
    // fail closed: a skipped guard would let the call through
    deny: "Sensitive File Guard failed while checking this call, so it was not run. Do not retry it unless the user asks you to.",
  }));
}
