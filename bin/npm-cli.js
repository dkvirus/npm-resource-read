#!/usr/bin/env node

/**
 * 自执行函数
 * 闭包内的变量作用域只在函数内，不会产生污染
 */
;(function () { 
  // WScript 是 window 原生脚本对象，typeof WScript !== 'undefined' 判断当前系统是否是 window 系统
  if (typeof WScript !== 'undefined') {
    WScript.echo(
      'npm does not work when run\n' +
        'with the Windows Scripting Host\n\n' +
        "'cd' to a different directory,\n" +
        "or type 'npm.cmd <args>',\n" +
        "or type 'node npm <args>'."
    )
    WScript.quit(1)
    return
  }

  /** 
   * process.title 属性用于获取或设置当前进程在 ps 命令中显示的进程名字
   * npm install 安装包需要花费一段时间，此时 npm 会占用一个进程，使用 ps aux | grep npm 可以查看到进程
   * dk: 查看到进程干嘛呢？？npm install 卡死关闭进程？？直接在终端 ctrl + c 不就中断运行了吗？why..
  */
  process.title = 'npm'

  /**
   * node version<6.0.0 直接报错
   */
  var unsupported = require('../lib/utils/unsupported.js')
  // npm@6.2.0 不兼容 node@4.7.0 以下的版本，检测当前 node 版本如果低于 4.7.0，进程中止，报错，下面的代码不会被执行
  unsupported.checkForBrokenNode()    

  var log = require('npmlog')
  /**
   * will be unpaused when config is loaded. dk: why do this？
   * log.pause() 下面所有 log.info()  压根就不会在控制台打印出来，为啥还要写条日志信息？？
   */
  log.pause() 
  log.info('it worked if it ends with', 'ok')

  unsupported.checkForUnsupportedNode()   // 检测当前 node 版本是否与 npm@6.2.0 兼容

  var path = require('path')
  // 重头戏1：引入 npm 各种方法
  var npm = require('../lib/npm.js')
  // 重头戏2：引入各种配置
  var npmconf = require('../lib/config/core.js')
  // 错误处理器
  var errorHandler = require('../lib/utils/error-handler.js')

  // 这三行是静态的配置              ////////////////////////
  var configDefs = npmconf.defs                 //////////
  var shorthands = configDefs.shorthands        //////////
  var types = configDefs.types                  //////////
  ////////////////////////////////////////////////////////

  var nopt = require('nopt')

  // if npm is called as "npmg" or "npm_g", then
  // run in global mode.
  /**
   * processs.argv 获取命令行参数，返回值是个数组
   * 示例：npm install fs -g
   *   [ 
   *     '/Users/dkvirus/.nvm/versions/node/v8.11.3/bin/node',
   *     '/Users/dkvirus/.nvm/versions/node/v8.11.3/bin/npm',
   *     'install',
   *     'fs',
   *     '-g' 
   *   ]
   * 解析：
   *    数组第一个值为 node 程序安装路径
   *    数组第二个值为命令 npm 安装路径
   *    数组第三个值以及之后的值为命令行参数
   * 
   * dk: 这里这个判断【path.basename(process.argv[1]).slice(-1) === 'g'】 有何意义？
   * 按照官方的意思是本来想敲 `npm -g`，结果手误敲成 `npmg` 或者 `npm_g`，Are you kidding me..
   * npmg 或者 npm_g 压根就没这个命令，控制台会直接报错的好吗？？这三行代码完全没有意义！！
   */
  if (path.basename(process.argv[1]).slice(-1) === 'g') {
    process.argv.splice(1, 1, 'npm', '-g')
  }

  // log.verbose() 也不打印，这里写这句话不觉明历，verbose 中文意思：冗长的，啰嗦的
  log.verbose('cli', process.argv)

  // 解析命令行选项  https://npm.taobao.org/package/nopt
  // conf 就是命令行选项转换的对象
  /**
   * $ npm install xx
   * conf = 
   *   { argv:
   *     { remain: [ 'install', 'xx' ],
   *       cooked: [ 'install', 'xx' ],
   *       original: [ 'install', 'xx' ] 
   *     } 
   *   }
   * $ npm
   * conf = 
   *   { 
   *      usage: true,
   *      argv: { 
   *        remain: [],
   *        cooked: [],
   *        original: [] 
   *      } 
   *   }
   */
  // 这里解析了命令行的参数
  var conf = nopt(types, shorthands)
  npm.argv = conf.argv.remain   // remain 过滤选项之后的命令

  // 命令瞎敲的,npm本身压根没有的，打印帮助文档信息，确定命令是啥
  if (npm.deref(npm.argv[0])) npm.command = npm.argv.shift()
  else conf.usage = true

  if (conf.version) {
    return errorHandler.exit(0)
  }

  if (conf.versions) {
    npm.command = 'version'
    conf.usage = false
    npm.argv = []
  }

  log.info('using', 'npm@%s', npm.version)
  log.info('using', 'node@%s', process.version)

  process.on('uncaughtException', errorHandler)

  /**
   * usage 为 true 表示查看说明文档
   */
  if (conf.usage && npm.command !== 'help') {
    npm.argv.unshift(npm.command)
    npm.command = 'help'
  }

  // now actually fire up npm and run the command.  现在实际启动npm并运行命令。
  // this is how to use npm programmatically:  以下是如何通过编程方式使用npm:
  conf._exit = true

  npm.load(conf, function (er) {
    if (er) return errorHandler(er)
    if (
      npm.config.get('update-notifier') &&
      !unsupported.checkVersion(process.version).unsupported
    ) {
      const pkg = require('../package.json')
      let notifier = require('update-notifier')({pkg})
      if (
        notifier.update &&
        notifier.update.latest !== pkg.version
      ) {
        const color = require('ansicolors')
        const useColor = npm.config.get('color')
        const useUnicode = npm.config.get('unicode')
        const old = notifier.update.current
        const latest = notifier.update.latest
        let type = notifier.update.type
        if (useColor) {
          switch (type) {
            case 'major':
              type = color.red(type)
              break
            case 'minor':
              type = color.yellow(type)
              break
            case 'patch':
              type = color.green(type)
              break
          }
        }
        const changelog = `https://github.com/npm/cli/releases/tag/v${latest}`
        notifier.notify({
          message: `New ${type} version of ${pkg.name} available! ${
            useColor ? color.red(old) : old
          } ${useUnicode ? '→' : '->'} ${
            useColor ? color.green(latest) : latest
          }\n` +
          `${
            useColor ? color.yellow('Changelog:') : 'Changelog:'
          } ${
            useColor ? color.cyan(changelog) : changelog
          }\n` +
          `Run ${
            useColor
              ? color.green(`npm install -g ${pkg.name}`)
              : `npm i -g ${pkg.name}`
          } to update!`
        })
      }
    }
    npm.commands[npm.command](npm.argv, function (err) {
      // https://genius.com/Lin-manuel-miranda-your-obedient-servant-lyrics
      if (
        !err &&
        npm.config.get('ham-it-up') &&
        !npm.config.get('json') &&
        !npm.config.get('parseable') &&
        npm.command !== 'completion'
      ) {
        console.error(
          `\n ${
            npm.config.get('unicode') ? '🎵 ' : ''
          } I Have the Honour to Be Your Obedient Servant,${
            npm.config.get('unicode') ? '🎵 ' : ''
          } ~ npm ${
            npm.config.get('unicode') ? '📜🖋 ' : ''
          }\n`
        )
      }
      errorHandler.apply(this, arguments)
    })
  })
})()
