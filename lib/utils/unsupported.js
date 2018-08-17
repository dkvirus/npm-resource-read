'use strict'

// semver 比较语义化版本大小的第三方包 
// 关于语义化版本相关，参阅：https://blog.dkvirus.top/%E6%95%85%E4%BA%8B/%E7%A8%8B%E5%BA%8F%E5%91%98%E5%BA%94%E8%AF%A5%E9%87%8D%E8%A7%86%E7%89%88%E6%9C%AC%E6%8E%A7%E5%88%B6/
var semver = require('semver')

// 支持的 node 版本
var supportedNode = [
  {ver: '6', min: '6.0.0'},
  {ver: '8', min: '8.0.0'},
  {ver: '9', min: '9.0.0'},
  {ver: '10', min: '10.0.0'},
  {ver: '11', min: '11.0.0'}
]
// 不支持的 Node 版本，node4.7 以下的低级版本不兼容
var knownBroken = '<4.7.0'

/**
 * process.version   可以获取当前机器上安装的 node 版本：v8.11.3
 */
var checkVersion = exports.checkVersion = function (version) {
  var versionNoPrerelease = version.replace(/-.*$/, '')
  return {
    /**
     * 版本中可能会有一些 alpha、beta 版本，写法如下：
     * v8.11.3-beta1.0    v8.11.3-alpha2.0
     * 上面的 beta1.0、alpha2.0 都叫做 prerelease
     * 正则处理去除 prerelease，只保留【主版本号.次级版本号.修复号】的格式
     * 关于版本相关，参阅：https://blog.dkvirus.top/%E6%95%85%E4%BA%8B/%E7%A8%8B%E5%BA%8F%E5%91%98%E5%BA%94%E8%AF%A5%E9%87%8D%E8%A7%86%E7%89%88%E6%9C%AC%E6%8E%A7%E5%88%B6/
     */
    version: versionNoPrerelease,
    /**
     * 示例：
     * broken = semver.satisfies('v3.11.3', '<4.7.0')    =>   true
     * broken = semver.satisfies('v8.11.3', '<4.7.0')    =>   false
     * broken = true 说明当前 node 版本低于 node@4.7.0，npm@6.2.0 不兼容 node@4.7.0
     */
    broken: semver.satisfies(versionNoPrerelease, knownBroken),  
    /**
     * supportedNode 对象记录所有 npm@6.2.0 兼容的 node 版本
     * semver.satisfies('v8.11.3', '^6.0.0||^8.0.0||^9.0.0||^10.0.0||^11.0.0')  => true
     * unsupported = !semver.satisfies('v8.11.3', '^6.0.0||^8.0.0||^9.0.0||^10.0.0||^11.0.0') => false
     * unsupported = true 说明当前 node 版本与 npm@6.2.0 不兼容
     * unsupported = false 说明当前 node 版本与 npm@6.2.0 兼容，木问题
     */  
    unsupported: !semver.satisfies(versionNoPrerelease, supportedNode.map(function (n) { return '^' + n.min }).join('||'))
  }
}

/**
 * 检测 npm@6.2.0 兼容的最低 node 版本
 * 如果当前 node 版本低于 4.7.0，进程直接退出，并报错提示信息
 * 如果当前 node 版本大于 4.7.0，不作处理
 */
exports.checkForBrokenNode = function () {
  var nodejs = checkVersion(process.version)
  if (nodejs.broken) {
    console.error('ERROR: npm is known not to run on Node.js ' + process.version)
    supportedNode.forEach(function (rel) {
      if (semver.satisfies(nodejs.version, rel.ver)) {
        console.error('Node.js ' + rel.ver + " is supported but the specific version you're running has")
        console.error('a bug known to break npm. Please update to at least ' + rel.min + ' to use this')
        console.error('version of npm. You can find the latest release of Node.js at https://nodejs.org/')
        process.exit(1)
      }
    })

    // 打印当前 npm@6.2.0 支持的 Node 版本
    var supportedMajors = supportedNode.map(function (n) { return n.ver }).join(', ')
    console.error("You'll need to upgrade to a newer version in order to use this")
    console.error('version of npm. Supported versions are ' + supportedMajors + '. You can find the')
    console.error('latest version at https://nodejs.org/')
    process.exit(1)
  }
}

/**
 * 检测当前 node 版本是否与 npm@6.2.0 兼容
 */
exports.checkForUnsupportedNode = function () {
  var nodejs = checkVersion(process.version)
  // 说明当前 node 版本与 npm@6.2.0 不兼容，提示升级 node 版本
  if (nodejs.unsupported) {
    var log = require('npmlog')
    var supportedMajors = supportedNode.map(function (n) { return n.ver }).join(', ')
    log.warn('npm', 'npm does not support Node.js ' + process.version)
    log.warn('npm', 'You should probably upgrade to a newer version of node as we')
    log.warn('npm', "can't make any promises that npm will work with this version.")
    log.warn('npm', 'Supported releases of Node.js are the latest release of ' + supportedMajors + '.')
    log.warn('npm', 'You can find the latest version at https://nodejs.org/')
  }
}
