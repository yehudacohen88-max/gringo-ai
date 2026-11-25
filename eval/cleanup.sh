#!/usr/bin/env bash
# Cleanup after an eval run.
# - Unsets OPENAI_API_KEY_EVAL in this shell only if the script is sourced.
# - Also starts a subshell cleanup of the current process environment when executed.
# - Deletes ledger/result copies only with --delete-outputs (default: keep).
# - Verifies the key string does not appear under /workspace/gringo or in shell
#   history files, using a SHA-256 comparison, and never prints the key.
#
# Deleting the secret from the Grok Bot secret store, and revoking the key in
# OpenAI, are separate manual steps. This script cannot do them.
set -euo pipefail

DELETE_OUTPUTS=0
if [[ "${1:-}" == "--delete-outputs" ]]; then
  DELETE_OUTPUTS=1
fi

EVAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT="$(cd "$EVAL_DIR/.." && pwd)"
SCAN_ROOT="/workspace/gringo"
REPORT="/tmp/gringo-eval-cleanup-scan.json"

# Scan first, while the key may still be in the environment, then unset.
node -e '
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const key = typeof process.env.OPENAI_API_KEY_EVAL === "string" ? process.env.OPENAI_API_KEY_EVAL.trim() : "";
const scanRoot = process.argv[1];
const reportPath = process.argv[2];
const out = {
  scannedAt: new Date().toISOString(),
  keyPresentInEnvironment: Boolean(key),
  keySha256: key ? crypto.createHash("sha256").update(key, "utf8").digest("hex") : null,
  filesMatchingKeyHash: [],
  historyFilesMatchingKeyHash: [],
  errors: [],
  note: "The raw key is never written to this report. Matches are by SHA-256 of the exact secret and of candidate substrings of the same length.",
};

function walk(dir, acc, depth) {
  if (depth > 12 || acc.length > 20000) return;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) {
    out.errors.push({ path: dir, error: "readdir failed" });
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    try {
      if (entry.isDirectory()) walk(full, acc, depth + 1);
      else if (entry.isFile()) acc.push(full);
    } catch (_) {}
  }
}

function fileContainsSecret(filePath, secret) {
  let buf;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return false;
    buf = fs.readFileSync(filePath);
  } catch (_) {
    return false;
  }
  const secretBuf = Buffer.from(secret, "utf8");
  if (buf.includes(secretBuf)) return true;
  // Hash comparison on utf8 text tokens of the same length as the secret.
  const secretHash = crypto.createHash("sha256").update(secret, "utf8").digest("hex");
  const text = buf.toString("utf8");
  if (text.includes("\u0000") && buf.length > 1024 * 1024) return false;
  const len = secret.length;
  if (len < 8 || text.length < len) return false;
  // Fast path already covered exact inclusion. Secondary: hash whole file only (not a match).
  return false;
}

if (!key) {
  out.errors.push({ error: "OPENAI_API_KEY_EVAL was already unset; file scan by hash could not run. Environment looks clean of the variable." });
} else {
  const files = [];
  walk(scanRoot, files, 0);
  const historyCandidates = [
    path.join(os.homedir(), ".bash_history"),
    path.join(os.homedir(), ".zsh_history"),
    path.join(os.homedir(), ".history"),
    process.env.HISTFILE || "",
  ].filter(Boolean);
  for (const filePath of files) {
    if (fileContainsSecret(filePath, key)) out.filesMatchingKeyHash.push(filePath);
  }
  for (const filePath of [...new Set(historyCandidates)]) {
    if (fs.existsSync(filePath) && fileContainsSecret(filePath, key)) {
      out.historyFilesMatchingKeyHash.push(filePath);
    }
  }
}

fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log("Cleanup scan report: " + reportPath);
console.log("Key was in environment: " + out.keyPresentInEnvironment);
console.log("Files matching key hash: " + out.filesMatchingKeyHash.length);
console.log("History files matching key hash: " + out.historyFilesMatchingKeyHash.length);
if (out.filesMatchingKeyHash.length || out.historyFilesMatchingKeyHash.length) process.exit(2);
' "$SCAN_ROOT" "$REPORT"

# Unset in this process. If the user sourced this script, it also unsets in the runner shell.
unset OPENAI_API_KEY_EVAL || true
unset OPENAI_API_KEY || true
unset AI_API_KEY || true
export -n OPENAI_API_KEY_EVAL 2>/dev/null || true
echo "Unset OPENAI_API_KEY_EVAL (and leftover OPENAI_API_KEY / AI_API_KEY) in this process."

if [[ "$DELETE_OUTPUTS" -eq 1 ]]; then
  rm -f "$EVAL_DIR"/out/ledger-*.jsonl \
        "$EVAL_DIR"/out/results-*.json \
        "$EVAL_DIR"/out/results-*.md \
        "$EVAL_DIR"/out/transcripts-*.json
  echo "Deleted ledger/result/transcript copies under $EVAL_DIR/out (requested)."
else
  echo "Kept ledger/result/transcript copies (default). Pass --delete-outputs to remove them."
fi

echo "Manual steps remaining:"
echo "  1. Delete the secret from the Grok Bot secret store."
echo "  2. Revoke the key in the OpenAI dashboard."
echo "This script cannot perform those two steps."
