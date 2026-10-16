'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { globSync } = require('./index.cjs');

const previousCwd = process.cwd();
const fixture = mkdtempSync(path.join(tmpdir(), 'portfolio-eslint-'));
for (const directory of ['packages/a/app', 'packages/b/pages', 'packages/space site/app', 'lib']) {
  mkdirSync(path.join(fixture, directory), { recursive: true });
}
process.chdir(fixture);
writeFileSync(path.join(fixture, 'packages/b/pages/index.tsx'), 'export default function Page() { return null; }');
after(() => {
  process.chdir(previousCwd);
  assert.ok(path.resolve(fixture).startsWith(path.join(path.resolve(tmpdir()), 'portfolio-eslint-')));
  rmSync(fixture, { recursive: true, force: true });
});

test('目錄搜尋保留精確路徑、相對前綴、glob 與 brace 語意', () => {
  const cases = [
    ['packages/a', ['packages/a']], ['packages/a/', ['packages/a/']],
    ['./packages/a', ['./packages/a']],
    ['packages/*', ['packages/a', 'packages/b', 'packages/space site']],
    ['packages/./*', ['packages/a', 'packages/b', 'packages/space site']],
    ['./packages/./*', ['./packages/a', './packages/b', './packages/space site']],
    ['packages/a/**', ['packages/a/app']], ['packages/a/**/', ['packages/a/app']],
    ['packages/*/**', ['packages/a', 'packages/a/app', 'packages/b', 'packages/b/pages', 'packages/space site', 'packages/space site/app']],
    ['packages/{a,b}/**', ['packages/a/app', 'packages/b/pages']],
    ['missing/**', []],
  ];
  for (const [pattern, expected] of cases) {
    assert.deepEqual(globSync(pattern, { onlyDirectories: true }).sort(), expected.sort(), pattern);
  }
  const absolute = path.join(fixture, 'packages/a').replace(/\\/g, '/');
  assert.deepEqual(globSync(absolute, { onlyDirectories: true }), [absolute]);
  assert.deepEqual(globSync(`${absolute}/**`, { onlyDirectories: true }), [`${absolute}/app`]);
});

test('不接受未支援的呼叫，避免未來上游改 API 時靜默給錯結果', () => {
  for (const pattern of ['', [], null]) assert.throws(() => globSync(pattern, { onlyDirectories: true }), TypeError);
  assert.throws(() => globSync('packages/*', {}), TypeError);
  assert.throws(() => globSync('packages/*', { onlyDirectories: true, dot: true }), TypeError);
  assert.throws(() => globSync('{1..1000000000}', { onlyDirectories: true }), RangeError);
});

test('Next ESLint 的實際 rootDir caller 與連結規則持續生效', () => {
  const pluginPath = require.resolve('@next/eslint-plugin-next');
  const { getRootDirs } = require(path.join(path.dirname(pluginPath), 'utils/get-root-dirs.js'));
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: {} }), [fixture]);
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: { next: { rootDir: ['packages/a', 'packages/b'] } } }), ['packages/a', 'packages/b']);
  assert.deepEqual(getRootDirs({ cwd: fixture, settings: { next: { rootDir: 'packages/./a/*' } } }), ['packages/a/app']);
  const { Linter } = require('eslint');
  const config = {
    files: ['**/*.jsx'],
    languageOptions: { parserOptions: { ecmaVersion: 2020, sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { '@next/next': require('@next/eslint-plugin-next') },
    settings: { next: { rootDir: 'packages/*' } },
    rules: { '@next/next/no-html-link-for-pages': 'error' },
  };
  const linter = new Linter();
  const invalid = linter.verify('const page = <a href="/">Home</a>;', config, { filename: 'fixture.jsx' });
  assert.ok(invalid.some((message) => message.ruleId === '@next/next/no-html-link-for-pages'));
  assert.deepEqual(linter.verify('const page = <Link href="/">Home</Link>;', config, { filename: 'fixture.jsx' }), []);
});
