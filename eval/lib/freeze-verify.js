'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FreezeChecksumError extends Error {
  constructor(message, mismatches = []) {
    super(message);
    this.name = 'FreezeChecksumError';
    this.mismatches = mismatches;
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function parseSums(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) throw new FreezeChecksumError(`Invalid SHA256SUMS line: ${trimmed.slice(0, 80)}`);
    entries.push({ hash: match[1].toLowerCase(), relative: match[2].trim() });
  }
  return entries;
}

function resolveSumsPath(freezeDirOrSumsPath) {
  if (!freezeDirOrSumsPath) return '';
  if (fs.existsSync(freezeDirOrSumsPath) && fs.statSync(freezeDirOrSumsPath).isDirectory()) {
    return path.join(freezeDirOrSumsPath, 'SHA256SUMS');
  }
  return freezeDirOrSumsPath;
}

function verifyFreezeChecksums({ sumsPath, rootDir, sumsText = null } = {}) {
  const resolvedSums = sumsText == null ? sumsPath : '';
  const text = sumsText == null ? fs.readFileSync(resolvedSums, 'utf8') : sumsText;
  const entries = parseSums(text);
  const mismatches = [];
  for (const entry of entries) {
    const filePath = path.join(rootDir, entry.relative);
    if (!fs.existsSync(filePath)) {
      mismatches.push({ relative: entry.relative, reason: 'missing', expected: entry.hash, actual: null });
      continue;
    }
    const actual = sha256File(filePath);
    if (actual !== entry.hash) {
      mismatches.push({ relative: entry.relative, reason: 'changed', expected: entry.hash, actual });
    }
  }
  if (mismatches.length) {
    throw new FreezeChecksumError(
      `Freeze checksum refusal: ${mismatches.length} file(s) missing or changed (${mismatches.map((row) => row.relative).join(', ')}).`,
      mismatches
    );
  }
  return { ok: true, checked: entries.length, sumsPath: resolvedSums || '(inline)' };
}

module.exports = {
  FreezeChecksumError,
  sha256File,
  parseSums,
  resolveSumsPath,
  verifyFreezeChecksums,
};
