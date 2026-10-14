/**
 * Unit tests for runtime/pins.json consistency.
 *
 * The pins manifest must agree with the actual sources it cites
 * (package.json ranges, CI workflow). Catches drift at commit time.
 *
 * Run: node tests/toolchain-pins.test.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

console.log('toolchain-pins');

const pins = JSON.parse(readFileSync(path.join(PROJECT, 'runtime', 'pins.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(PROJECT, 'package.json'), 'utf8'));
const workflow = readFileSync(path.join(PROJECT, '.github', 'workflows', 'build.yml'), 'utf8');

check(pins.pins.electron.range === pkg.devDependencies.electron,
  `electron pin matches package.json (${pkg.devDependencies.electron})`);
check(workflow.includes(`node-version: ${pins.pins.node.major}`),
  `node pin matches CI workflow (node-version: ${pins.pins.node.major})`);
check(workflow.includes('npm ci'),
  'install pin matches CI (npm ci)');
check(typeof pins.pins.node.major === 'number' && pins.pins.node.major >= 18,
  'node pin is a sane major version');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
