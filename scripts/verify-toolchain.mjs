#!/usr/bin/env node
/**
 * Verify the local toolchain against runtime/pins.json.
 *
 * Checks: Node.js major version, installed Electron version satisfies the
 * pinned range, and package-lock.json exists for reproducible installs.
 * Exit 0 when everything matches, 1 with a diagnostic otherwise.
 *
 * Run: node scripts/verify-toolchain.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const pins = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'pins.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));

// 1. Node.js major.
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor !== pins.pins.node.major) {
  problems.push(`node major is ${nodeMajor}, pinned ${pins.pins.node.major} (${pins.pins.node.source})`);
}

// 2. Electron satisfies the pinned range (major must match ^29).
const wantMajor = Number(pins.pins.electron.range.replace(/^[^\d]*/, '').split('.')[0]);
const electronPkgPath = path.join(PROJECT, 'node_modules', 'electron', 'package.json');
if (existsSync(electronPkgPath)) {
  const have = JSON.parse(readFileSync(electronPkgPath, 'utf8')).version;
  const haveMajor = Number(String(have).split('.')[0]);
  if (haveMajor !== wantMajor) {
    problems.push(`electron ${have} does not satisfy pinned ${pins.pins.electron.range}`);
  }
} else if (!String(pkg.devDependencies?.electron || '').includes(String(wantMajor))) {
  problems.push(`package.json electron range ${pkg.devDependencies?.electron} disagrees with pins ${pins.pins.electron.range}`);
}

// 3. Reproducible installs.
if (!existsSync(path.join(PROJECT, pins.pins.install.lockfile))) {
  problems.push(`missing ${pins.pins.install.lockfile}: install with ${pins.pins.install.command}`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`toolchain: ${p}`);
  process.exit(1);
}
console.log(`toolchain ok: node ${process.versions.node}, electron ${pins.pins.electron.range}`);
