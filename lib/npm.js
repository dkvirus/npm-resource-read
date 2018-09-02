;(function () {
  // windows: running 'npm blah' in this folder will invoke WSH, not node.
  /* globals WScript */
  if (typeof WScript !== 'undefined') {
    WScript.echo(
      'npm does not work when run\n' +
      'with the Windows Scripting Host\n\n' +
      '"cd" to a different directory,\n' +
      'or type "npm.cmd <args>",\n' +
      'or type "node npm <args>".'
    )
    WScript.quit(1)
    return
  }

  var unsupported = require('../lib/utils/unsupported.js')
  unsupported.checkForBrokenNode()

  // 替换 fs，进行各种改进。dk:看来 npm 对于 node 的 fs 模块不是很看好啊
  var gfs = require('graceful-fs')
  // 在应用程序级别对全局fs模块进行补丁
  var fs = gfs.gracefulify(require('fs'))

  var EventEmitter = require('events').EventEmitter
  // npm 对象继承 EventEmitter，拥有 on(注册事件) 和 emit(触发事件) 方法
  var npm = module.exports = new EventEmitter()
  var npmconf = require('./config/core.js')
  var log = require('npmlog')
  var inspect = require('util').inspect

  // 捕获全局日志
  process.on('log', function (level) {
    try {
      return log[level].apply(log, [].slice.call(arguments, 1))
    } catch (ex) {
      log.verbose('attempt to log ' + inspect(arguments) + ' crashed: ' + ex.message)
    }
  })

  var path = require('path')
  var abbrev = require('abbrev')
  var which = require('which')
  var glob = require('glob')
  var rimraf = require('rimraf')
  var lazyProperty = require('lazy-property')
  var parseJSON = require('./utils/parse-json.js')
  var clientConfig = require('./config/reg-client.js')
  var aliases = require('./config/cmd-list').aliases
  var cmdList = require('./config/cmd-list').cmdList
  var plumbing = require('./config/cmd-list').plumbing
  var output = require('./utils/output.js')
  var startMetrics = require('./utils/metrics.js').start
  var perf = require('./utils/perf.js')

  perf.emit('time', 'npm')
  perf.on('timing', function (name, finished) {
    log.timing(name, 'Completed in', finished + 'ms')
  })

  /**
   * npm = {
   *  config: { long: true },
   *  commands: {},             // fullList 所有属性放到这里，不过要做一层拦截处理
   *  command: '',              // 当前执行的命令缩写
   *  limit: {},
   *  lockfileVersion: 1,
   *  rollbacks: [],
   *  name: 'npm',              // npm 工程的包名，从 package.json 中获取
   *  version: 'v6.2.0',        // npm 工程的版本，从 package.json 中获取
   *  fullList: [],             // 所有命令
   *  deref: function () {},    // 处理缩写返回完整命令名
   *  prefix, 
   *  bin, 
   *  globalBin, 
   *  dir, 
   *  globalDir, 
   *  root, 
   *  cache, 
   *  tmp,
   * }
   */

  // 配置呗
  npm.config = {
    loaded: false,
    get: function () {
      throw new Error('npm.load() required')
    },
    set: function () {
      throw new Error('npm.load() required')
    }
  }

  // 命令呗
  npm.commands = {}

  // TUNING
  npm.limit = {
    fetch: 10,     // 一次性只能下载 10 个包？？
    action: 50
  }
  // ***

  npm.lockfileVersion = 1

  npm.rollbacks = []

  try {
    // startup, ok to do this synchronously
    var j = parseJSON(fs.readFileSync(
      path.join(__dirname, '../package.json')) + '')
    npm.name = j.name
    npm.version = j.version
  } catch (ex) {
    try {
      log.info('error reading version', ex)
    } catch (er) {}
    npm.version = ex
  }

  var commandCache = {}       // 命令还缓存干嘛？？
  var aliasNames = Object.keys(aliases)   // 获取别名对象中所有键组成的数组 

  var littleGuys = [ 'isntall', 'verison' ]
  var fullList = cmdList.concat(aliasNames).filter(function (c) {
    return plumbing.indexOf(c) === -1
  })
  // 所有命令以及其缩写
  var abbrevs = abbrev(fullList)

  // we have our reasons
  // dk: what reason，littleGuys = [ 'isntall', 'verison' ]  isntall 是啥回事，笔误？？
  fullList = npm.fullList = fullList.filter(function (c) {
    return littleGuys.indexOf(c) === -1
  })

  var registryRefer
  var registryLoaded

  // 遍历所有命令简写，添加 get 拦截器，将当前将要执行的命令添加到命令缓存对象中 commandCache
  Object.keys(abbrevs).concat(plumbing).forEach(function addCommand (c) {
    // c 表示命令的缩写
    Object.defineProperty(npm.commands, c, { get: function () {
      // why loaded is true??
      if (!loaded) {
        throw new Error(
          'Call npm.load(config, cb) before using this command.\n' +
            'See the README.md or bin/npm-cli.js for example usage.'
        )
      }
      // 由缩写获取具体的命令，如：veri => version
      var a = npm.deref(c)
      // npm ll => 以树形结构列出依赖包之间关系
      if (c === 'la' || c === 'll') {
        npm.config.set('long', true)
      }

      npm.command = c
      if (commandCache[a]) return commandCache[a]

      // >>>>>>>>>>>>>>>>>> 去找对应的命令吧 <<<<<<<<<<<<<<<<<<<<<<<
      // 返回的 cmd 都是函数字符串，还未执行
      var cmd = require(path.join(__dirname, a + '.js'))

      // 将当前命令添加到命令缓存对象中
      commandCache[a] = function () {
        var args = Array.prototype.slice.call(arguments, 0)
        if (typeof args[args.length - 1] !== 'function') {
          args.push(defaultCb)
        }
        if (args.length === 1) args.unshift([])

        // Options are prefixed by a hyphen-minus (-, \u2d).
        // Other dash-type chars look similar but are invalid.
        Array(args[0]).forEach(function (arg) {
          if (/^[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/.test(arg)) {
            log.error('arg', 'Argument starts with non-ascii dash, this is probably invalid:', arg)
          }
        })

        if (!registryRefer) {
          registryRefer = [a].concat(args[0]).map(function (arg) {
            // exclude anything that might be a URL, path, or private module
            // Those things will always have a slash in them somewhere
            if (arg && arg.match && arg.match(/\/|\\/)) {
              return '[REDACTED]'
            } else {
              return arg
            }
          }).filter(function (arg) {
            return arg && arg.match
          }).join(' ')
          if (registryLoaded) npm.registry.refer = registryRefer
        }

        cmd.apply(npm, args)
      }

      // Object.keys(cmd) = ['usage']
      // 这里将函数字符串放到缓存里，不用每次启动 npm 还要去读文件取，考虑效率
      Object.keys(cmd).forEach(function (k) {
        commandCache[a][k] = cmd[k]
      })

      return commandCache[a]
    },
    enumerable: fullList.indexOf(c) !== -1,
    configurable: true })

    // make css-case commands callable via camelCase as well
    if (c.match(/-([a-z])/)) {
      addCommand(c.replace(/-([a-z])/g, function (a, b) {
        return b.toUpperCase()
      }))
    }
  })

  // 默认回调函数，打印错误信息 or data 信息
  function defaultCb (er, data) {
    log.disableProgress()
    if (er) console.error(er.stack || er.message)
    else output(data)
  }

  // c 是命令缩写，处理之后返回缩写对应的命令名
  npm.deref = function (c) {
    if (!c) return ''
    // saveDev => save-dev，这行判断多余，穿进来的 c 压根就不会有大写
    if (c.match(/[A-Z]/)) {
      c = c.replace(/([A-Z])/g, function (m) {
        return '-' + m.toLowerCase()
      })
    }
    if (plumbing.indexOf(c) !== -1) return c
    var a = abbrevs[c]
    while (aliases[a]) {
      a = aliases[a]
    }
    return a
  }

  var loaded = false        // 处理已完成
  var loading = false       // 正在处理中
  var loadErr = null        // 处理错误
  var loadListeners = []    // 监听器

  // ??
  function loadCb (er) {
    loadListeners.forEach(function (cb) {
      /** 
       * process.nextTick()方法将 callback 添加到"next tick 队列"。 
       * 一旦当前事件轮询队列的任务全部完成，在next tick队列中的所有callbacks会被依次调用。
       */
      process.nextTick(cb.bind(npm, er, npm))
    })
    loadListeners.length = 0
  }

  /**
   * 
   * @param {*} cli 参数 
   * @param {*} cb_ 回调函数
   */
  npm.load = function (cli, cb_) {
    // 防止参数传递顺序有误
    if (!cb_ && typeof cli === 'function') {
      cb_ = cli
      cli = {}
    }
    // 防止参数为空
    if (!cb_) cb_ = function () {}
    if (!cli) cli = {}

    // 将回调函数放到监听器数组中？？回调函数是通用的。。。
    loadListeners.push(cb_)

    // 处理一波状态
    if (loaded || loadErr) return cb(loadErr)
    if (loading) return
    loading = true
    var onload = true

    // 定义处理错误函数
    function cb (er) {
      if (loadErr) return
      loadErr = er
      if (er) return cb_(er)
      if (npm.config.get('force')) {
        log.warn('using --force', 'I sure hope you know what you are doing.')
      }
      npm.config.loaded = true
      loaded = true
      loadCb(loadErr = er)
      onload = onload && npm.config.get('onload-script')
      if (onload) {
        try {
          require(onload)
        } catch (err) {
          log.warn('onload-script', 'failed to require onload script', onload)
          log.warn('onload-script', err)
        }
        onload = false
      }
    }

    log.pause()

    // 调用其它方法？？
    load(npm, cli, cb)
  }

  /**
   * 不停的做处理，最终将 npm 对象扔给回调函数
   * @param {*} npm 
   * @param {*} cli 
   * @param {*} cb 
   */
  function load (npm, cli, cb) {
    /**
     * process.argv[0]   node 安装路径
     * process.argv[1]   npm 安装路径
     */
    which(process.argv[0], function (er, node) {
      if (!er && node.toUpperCase() !== process.execPath.toUpperCase()) {
        log.verbose('node symlink', node)
        process.execPath = node
        process.installPrefix = path.resolve(node, '..', '..')
      }

      // look up configs
      var builtin = path.resolve(__dirname, '..', 'npmrc')
      // 获取配置文件 npm.config = config 
      npmconf.load(cli, builtin, function (er, config) {
        if (er === config) er = null

        npm.config = config
        if (er) return cb(er)

        // if the 'project' config is not a filename, and we're
        // not in global mode, then that means that it collided
        // with either the default or effective userland config
        if (!config.get('global') &&
            config.sources.project &&
            config.sources.project.type !== 'ini') {
          log.verbose(
            'config',
            'Skipping project config: %s. (matches userconfig)',
            config.localPrefix + '/.npmrc'
          )
        }

        // Include npm-version and node-version in user-agent
        var ua = config.get('user-agent') || ''
        ua = ua.replace(/\{node-version\}/gi, process.version)
        ua = ua.replace(/\{npm-version\}/gi, npm.version)
        ua = ua.replace(/\{platform\}/gi, process.platform)
        ua = ua.replace(/\{arch\}/gi, process.arch)
        config.set('user-agent', ua)

        if (config.get('metrics-registry') == null) {
          config.set('metrics-registry', config.get('registry'))
        }

        var color = config.get('color')

        if (npm.config.get('timing') && npm.config.get('loglevel') === 'notice') {
          log.level = 'timing'
        } else {
          log.level = config.get('loglevel')
        }
        log.heading = config.get('heading') || 'npm'
        log.stream = config.get('logstream')

        switch (color) {
          case 'always':
            npm.color = true
            break
          case false:
            npm.color = false
            break
          default:
            npm.color = process.stdout.isTTY && process.env['TERM'] !== 'dumb'
            break
        }
        if (npm.color) {
          log.enableColor()
        } else {
          log.disableColor()
        }

        if (config.get('unicode')) {
          log.enableUnicode()
        } else {
          log.disableUnicode()
        }

        if (config.get('progress') && process.stderr.isTTY && process.env['TERM'] !== 'dumb') {
          log.enableProgress()
        } else {
          log.disableProgress()
        }

        glob(path.resolve(npm.cache, '_logs', '*-debug.log'), function (er, files) {
          if (er) return cb(er)
          // 日志文件多了，删除老的，保留最新的
          while (files.length >= npm.config.get('logs-max')) {
            rimraf.sync(files[0])
            files.splice(0, 1)
          }
        })

        log.resume()

        var umask = npm.config.get('umask')
        npm.modes = {
          exec: parseInt('0777', 8) & (~umask),
          file: parseInt('0666', 8) & (~umask),
          umask: umask
        }

        var gp = Object.getOwnPropertyDescriptor(config, 'globalPrefix')
        Object.defineProperty(npm, 'globalPrefix', gp)

        var lp = Object.getOwnPropertyDescriptor(config, 'localPrefix')
        Object.defineProperty(npm, 'localPrefix', lp)

        config.set('scope', scopeifyScope(config.get('scope')))
        npm.projectScope = config.get('scope') ||
         scopeifyScope(getProjectScope(npm.prefix))

        // at this point the configs are all set.
        // go ahead and spin up the registry client.
        lazyProperty(npm, 'registry', function () {
          registryLoaded = true
          var RegClient = require('npm-registry-client')
          var registry = new RegClient(clientConfig(npm, log, npm.config))
          registry.version = npm.version
          registry.refer = registryRefer
          return registry
        })

        startMetrics()

        return cb(null, npm)
      })
    })
  }
  
  // 全局操作还是本地操作
  Object.defineProperty(npm, 'prefix',
    {
      get: function () {
        return npm.config.get('global') ? npm.globalPrefix : npm.localPrefix
      },
      set: function (r) {
        var k = npm.config.get('global') ? 'globalPrefix' : 'localPrefix'
        npm[k] = r
        return r
      },
      enumerable: true
    })

  Object.defineProperty(npm, 'bin',
    {
      get: function () {
        if (npm.config.get('global')) return npm.globalBin
        return path.resolve(npm.root, '.bin')
      },
      enumerable: true
    })

  Object.defineProperty(npm, 'globalBin',
    {
      get: function () {
        var b = npm.globalPrefix
        if (process.platform !== 'win32') b = path.resolve(b, 'bin')
        return b
      }
    })

  Object.defineProperty(npm, 'dir',
    {
      get: function () {
        if (npm.config.get('global')) return npm.globalDir
        return path.resolve(npm.prefix, 'node_modules')
      },
      enumerable: true
    })

  Object.defineProperty(npm, 'globalDir',
    {
      get: function () {
        return (process.platform !== 'win32')
          ? path.resolve(npm.globalPrefix, 'lib', 'node_modules')
          : path.resolve(npm.globalPrefix, 'node_modules')
      },
      enumerable: true
    })

  Object.defineProperty(npm, 'root',
    { get: function () { return npm.dir } })

  Object.defineProperty(npm, 'cache',
    { get: function () { return npm.config.get('cache') },
      set: function (r) { return npm.config.set('cache', r) },
      enumerable: true
    })

  var tmpFolder
  var rand = require('crypto').randomBytes(4).toString('hex')
  Object.defineProperty(npm, 'tmp',
    {
      get: function () {
        if (!tmpFolder) tmpFolder = 'npm-' + process.pid + '-' + rand
        return path.resolve(npm.config.get('tmp'), tmpFolder)
      },
      enumerable: true
    })

  // the better to repl you with
  Object.getOwnPropertyNames(npm.commands).forEach(function (n) {
    if (npm.hasOwnProperty(n) || n === 'config') return

    Object.defineProperty(npm, n, { get: function () {
      return function () {
        var args = Array.prototype.slice.call(arguments, 0)
        var cb = defaultCb

        if (args.length === 1 && Array.isArray(args[0])) {
          args = args[0]
        }

        if (typeof args[args.length - 1] === 'function') {
          cb = args.pop()
        }
        npm.commands[n](args, cb)
      }
    },
    enumerable: false,
    configurable: true })
  })

  if (require.main === module) {
    require('../bin/npm-cli.js')
  }

  function scopeifyScope (scope) {
    return (!scope || scope[0] === '@') ? scope : ('@' + scope)
  }

  function getProjectScope (prefix) {
    try {
      var pkg = JSON.parse(fs.readFileSync(path.join(prefix, 'package.json')))
      if (typeof pkg.name !== 'string') return ''
      var sep = pkg.name.indexOf('/')
      if (sep === -1) return ''
      return pkg.name.slice(0, sep)
    } catch (ex) {
      return ''
    }
  }

})()
