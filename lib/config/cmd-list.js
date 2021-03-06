/**
 * 命令
 */

// 命令简写
var shorthands = {
  'un': 'uninstall',
  'rb': 'rebuild',
  'list': 'ls',
  'ln': 'link',
  'create': 'init',
  'i': 'install',
  'it': 'install-test',
  'cit': 'install-ci-test',
  'up': 'update',
  'c': 'config',
  's': 'search',
  'se': 'search',
  'unstar': 'star', // same function
  'tst': 'test',
  't': 'test',
  'ddp': 'dedupe',
  'v': 'view',
  'run': 'run-script'
}

/**
 * affordance  n.功能可见性；自解释性；给养
 * dk: ???
 */
var affordances = {
  'la': 'ls',
  'll': 'ls',
  'verison': 'version',
  'ic': 'ci',
  'innit': 'init',
  'isntall': 'install',
  'dist-tags': 'dist-tag',
  'apihelp': 'help',
  'find-dupes': 'dedupe',
  'upgrade': 'update',
  'udpate': 'update',
  'login': 'adduser',
  'add-user': 'adduser',
  'author': 'owner',
  'home': 'docs',
  'issues': 'bugs',
  'info': 'view',
  'show': 'view',
  'find': 'search',
  'add': 'install',
  'unlink': 'uninstall',
  'remove': 'uninstall',
  'rm': 'uninstall',
  'r': 'uninstall',
  'rum': 'run-script',
  'sit': 'cit',
  'urn': 'run-script'
}

/**
 * 当前目录下有哪些子文件, ci.js  install.js
 * 这些子文件都是命令 npm ci、 npm install、npm install-test
 */
var cmdList = [
  'ci',
  'install',
  'install-test',
  'uninstall',
  'cache',
  'config',
  'set',
  'get',
  'update',
  'outdated',
  'prune',
  'pack',
  'dedupe',
  'hook',

  'rebuild',
  'link',

  'publish',
  'star',
  'stars',
  'adduser',
  'login', // This is an alias for `adduser` but it can be confusing
  'logout',
  'unpublish',
  'owner',
  'access',
  'team',
  'deprecate',
  'shrinkwrap',
  'token',
  'profile',
  'audit',

  'help',
  'help-search',
  'ls',
  'search',
  'view',
  'init',
  'version',
  'edit',
  'explore',
  'docs',
  'repo',
  'bugs',
  'root',
  'prefix',
  'bin',
  'whoami',
  'dist-tag',
  'ping',

  'test',
  'stop',
  'start',
  'restart',
  'run-script',
  'completion',
  'doctor'
]

/**
 * plumbing  n. 铅工业；铅管品制造
 * dk: 这些命令不提供外界使用
 */
var plumbing = [
  'build',
  'unbuild',
  'xmas',
  'substack',
  'visnup'
]
module.exports.aliases = Object.assign({}, shorthands, affordances)
module.exports.shorthands = shorthands
module.exports.affordances = affordances
module.exports.cmdList = cmdList
module.exports.plumbing = plumbing
