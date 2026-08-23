#!/usr/bin/env node
// Lightweight, dependency-free CI check for this static site:
//
//  1. Every standalone .js file, and every inline <script> block in every
//     .html file, must be syntactically valid.
//  2. Every local asset reference in a .html file (src=/href= pointing at a
//     relative path, not a URL/anchor/mailto/data-uri) must resolve to a
//     real file in the repo. This is exactly the class of mistake that hit
//     this repo for real: a filename rename or an accidental overwrite that
//     leaves markup pointing at the wrong (or missing) thing.
//
// No dependencies on purpose — this runs with nothing but `node`, no
// npm install step, no lockfile to keep in sync.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = walk(ROOT);
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
const jsFiles = allFiles.filter((f) => f.endsWith('.js'));

const failures = [];

// 1a. Syntax-check standalone .js files (functions/**, catalog.js, etc).
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    failures.push(`${relative(ROOT, file)}: ${(e.stderr || e.message).toString().trim()}`);
  }
}

// 1b. Syntax-check inline <script> blocks (skip ones with a src= attribute —
// those load an external file, already covered by the pass above).
const scriptBlockRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  let match;
  let i = 0;
  while ((match = scriptBlockRe.exec(html))) {
    i++;
    const code = match[1];
    if (!code.trim()) continue;
    try {
      new Function(code);
    } catch (e) {
      failures.push(`${relative(ROOT, file)}: inline <script> #${i} — ${e.message}`);
    }
  }
}

// 2. Every local asset reference must resolve to a real file. <source> is
// skipped deliberately — it's this codebase's documented pattern for an
// optional drop-in (e.g. index.html's hero-bg.mp4) that degrades to a
// fallback when the file isn't present, so a missing one isn't a bug.
const tagRe = /<(\w+)((?:\s+[^<>]*)?)>/gi;
const attrRe = /\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
function isLocalRef(ref) {
  if (!ref) return false;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref)) return false; // http(s)://, //cdn...
  if (/^(?:mailto:|tel:|data:|javascript:|#)/i.test(ref)) return false;
  return true;
}
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  let tagMatch;
  while ((tagMatch = tagRe.exec(html))) {
    const [, tagName, attrs] = tagMatch;
    if (tagName.toLowerCase() === 'source') continue;
    attrRe.lastIndex = 0;
    let attrMatch;
    while ((attrMatch = attrRe.exec(attrs))) {
      const ref = attrMatch[1].split('#')[0].split('?')[0];
      if (!isLocalRef(ref)) continue;
      const target = join(dirname(file), ref);
      if (!existsSync(target)) {
        failures.push(`${relative(ROOT, file)}: <${tagName}> references missing local file "${ref}"`);
      }
    }
  }
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} problem(s) found:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ ${jsFiles.length} JS file(s) and ${htmlFiles.length} HTML file(s) checked clean.`);
