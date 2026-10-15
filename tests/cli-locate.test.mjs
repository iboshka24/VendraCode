/**
 * Unit tests for the Windows-aware CLI locator in electron/main.js.
 *
 * The helpers are extracted from the main file (it cannot be required directly
 * — it boots Electron) and evaluated in a sandbox with a mocked platform/env,
 * so the Windows branches are exercised on any OS.
 *
 * Run: `npm run test:unit`
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(path.join(PROJECT, 'electron', 'main.js'), 'utf8');

/** Pulls a top-level `function name(...) {...}` or `const NAME = ...;` block. */
function extract(name) {
  const fnMatch = SOURCE.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`));
  if (fnMatch) return fnMatch[0];
  const constMatch = SOURCE.match(new RegExp(`const ${name} = [^;]*;`));
  if (constMatch) return constMatch[0];
  throw new Error(`could not extract ${name} from electron/main.js`);
}

const HELPERS = [
  extract('IS_WIN'),
  extract('windowsExts'),
  extract('cliSearchDirs'),
  extract('cliCandidatePaths'),
  extract('resolveCliBinary'),
  extract('quoteForCmd'),
].join('\n\n');

function sandbox({ platform = 'linux', env = {}, existing = new Set(), whereOutput } = {}) {
  const fakeFs = { existsSync: (p) => existing.has(String(p)) };
  const fakeProcess = { platform, env };
  const childProcess = {
    execFileSync: () => { if (whereOutput !== undefined) return whereOutput; throw new Error('not on PATH (mocked)'); },
  };
  const requireShim = (name) => (name === 'child_process' ? childProcess : require(name));
  const factory = new Function(
    'path', 'fs', 'process', 'require',
    `${HELPERS}\nreturn { resolveCliBinary, cliSearchDirs, quoteForCmd, windowsExts };`
  );
  return factory(path, fakeFs, fakeProcess, requireShim);
}

let pass = 0;
let fail = 0;
const check = (ok, label) => { ok ? pass++ : fail++; console.log(`${ok ? '  ✓' : '  ✗'} ${label}`); };

console.log('Windows CLI locator');

// ── 1. Windows well-known folders ─────────────────────────────────
{
  const win = sandbox({
    platform: 'win32',
    env: {
      USERPROFILE: 'C:\\Users\\ibrohim',
      APPDATA: 'C:\\Users\\ibrohim\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\ibrohim\\AppData\\Local',
      ProgramData: 'C:\\ProgramData',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    },
  });
  const dirs = win.cliSearchDirs();
  check(dirs.some((d) => d === path.join('C:\\Users\\ibrohim\\AppData\\Roaming', 'npm')), 'npm -g shim dir (%APPDATA%\\npm) включён');
  check(dirs.some((d) => d.endsWith(path.join('.opencode', 'bin'))), 'installer dir (~\\.opencode\\bin) включён');
  check(dirs.some((d) => d.endsWith(path.join('.bun', 'bin'))), 'bun dir (~\\.bun\\bin) включён');
  check(dirs.some((d) => d.endsWith(path.join('scoop', 'shims'))), 'scoop shims включён');
  check(dirs.some((d) => d.endsWith(path.join('chocolatey', 'bin'))), 'chocolatey bin включён');
  check(!dirs.some((d) => d.includes('/usr/local/bin')), 'нет unix-путей в windows-списке');
  check(win.windowsExts().includes('.cmd') && win.windowsExts().includes('.exe'), 'PATHEXT даёт .cmd/.exe');
}

// ── 2. Windows extension probing (binName → opencode.cmd) ────────
{
  const cmdPath = path.join('C:\\Users\\ibrohim\\AppData\\Roaming', 'npm', 'opencode.cmd');
  const win = sandbox({
    platform: 'win32',
    env: {
      USERPROFILE: 'C:\\Users\\ibrohim',
      APPDATA: 'C:\\Users\\ibrohim\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\ibrohim\\AppData\\Local',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    },
    existing: new Set([cmdPath]),
  });
  check(win.resolveCliBinary('opencode') === cmdPath, 'npm-установленный opencode находится как opencode.cmd');
}

// ── 3. Windows native .exe first ─────────────────────────────────
{
  const exePath = path.join('C:\\Users\\ibrohim', '.opencode', 'bin', 'opencode.exe');
  const win = sandbox({
    platform: 'win32',
    env: {
      USERPROFILE: 'C:\\Users\\ibrohim',
      APPDATA: 'C:\\Users\\ibrohim\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\ibrohim\\AppData\\Local',
      PATHEXT: '.COM;.EXE;.BAT;.CMD',
    },
    existing: new Set([exePath]),
  });
  check(win.resolveCliBinary('opencode') === exePath, 'installer-овый opencode.exe находится');
}

// ── 4. cmd.exe argument quoting ──────────────────────────────────
{
  const lin = sandbox({ platform: 'linux', env: {} });
  check(lin.quoteForCmd('PONG') === '"PONG"', 'простой аргумент оборачивается в кавычки');
  check(lin.quoteForCmd('') === '""', 'пустой аргумент → ""');
  check(lin.quoteForCmd('привет мир') === '"привет мир"', 'пробелы внутри сохраняются');
  check(lin.quoteForCmd('сказал "ок"') === '"сказал \\"ок\\""', 'кавычки экранируются как \\"');
  check(lin.quoteForCmd('C:\\a b\\c\\') === '"C:\\a b\\c\\\\"', 'хвостовые слэши удваиваются перед закрывающей кавычкой');
}

// ── 5. Linux behaviour unchanged ─────────────────────────────────
{
  const linuxPath = path.join('/home', 'ibrohim', '.opencode', 'bin', 'opencode');
  const lin = sandbox({ platform: 'linux', env: { HOME: '/home/ibrohim' }, existing: new Set([linuxPath]) });
  check(lin.resolveCliBinary('opencode') === linuxPath, 'linux по-прежнему находит ~/.opencode/bin/opencode');
  check(lin.cliSearchDirs().includes('/usr/bin'), 'linux-пути на месте');
}


// npm ships both a POSIX shell script and a Windows command shim.
{
  const base = path.join('C:/Users/test/AppData/Roaming/npm', 'codex');
  const existing = new Set([base, base + '.cmd']);
  const opts = { platform: 'win32', env: { APPDATA: 'C:/Users/test/AppData/Roaming' }, existing };
  check(sandbox({ ...opts, whereOutput: base + '\r\n' + base + '.cmd\r\n' }).resolveCliBinary('codex') === base + '.cmd', 'Windows PATH skips the npm POSIX shell shim');
  check(sandbox(opts).resolveCliBinary('codex') === base + '.cmd', 'Windows fallback skips the npm POSIX shell shim');
}

console.log(`\nИТОГ: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
