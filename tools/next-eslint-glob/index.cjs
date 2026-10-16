'use strict';

const { statSync } = require('node:fs');
const { posix } = require('node:path');
const globParent = require('glob-parent');
const { braceExpand, Minimatch } = require('minimatch');
const { globSync: find, isDynamicPattern } = require('tinyglobby');

function matchingDirectories(pattern) {
  if (!isDynamicPattern(pattern)) {
    return statSync(pattern, { throwIfNoEntry: false })?.isDirectory() ? [pattern] : [];
  }
  const base = globParent(pattern);
  const normalized = pattern.split('/').filter((part) => part !== '.').join('/').replace(/\/+$/, '');
  const matcher = new Minimatch(normalized, { nonegate: true, nocomment: true });
  return find('**/*', { cwd: base, onlyDirectories: true, expandDirectories: false, dot: true })
    .map((entry) => posix.join(base, entry.replace(/\/$/, '')))
    .filter((entry) => matcher.match(entry) || matcher.match(`${entry}/`))
    .map((entry) => `${pattern.startsWith('./') ? './' : ''}${entry}`);
}

// shortcut: 僅相容 Next ESLint 的目錄 globSync；上游移除 fast-glob 後刪除此替代層。
function globSync(pattern, options) {
  if (typeof pattern !== 'string' || !pattern || options?.onlyDirectories !== true ||
      Object.keys(options).some((key) => key !== 'onlyDirectories')) {
    throw new TypeError('僅支援非空目錄 pattern 與 onlyDirectories: true');
  }
  if (pattern.startsWith('!') && !pattern.startsWith('!(')) return [];
  // 每個展開路徑都會查磁碟，先限制數量，避免拖住 lint。
  const patterns = braceExpand(pattern, { braceExpandMax: 1001 });
  if (patterns.length > 1000) throw new RangeError('目錄 pattern 展開不可超過 1000 個');
  return [...new Set(patterns.flatMap(matchingDirectories))];
}

module.exports = { globSync };
