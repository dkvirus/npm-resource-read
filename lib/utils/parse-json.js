'use strict'

/**
 * json-parse-better-errors 的功能和 JSON.parse() 类似，只是号称打印更完美的错误日志，然而
 * 测试并未发现都什么有用的错误信息。
 * 
 * 这个文件的作用应该是处理 UTF-8 带不带 BOM 产生的各种副作用，毕竟网上很多人留言被 BOM 坑过，
 * dk 还是太年轻，还没被 BOM 坑过。
 * 
 * stripBOM() 比较耐人寻味。UTF-8 => UTF-16 ??
 * UTF-8 和 UTF-8 BOM 有啥区别 ??
 * 参考阅读：
 * https://blog.csdn.net/xiangbq/article/details/51919219
 * https://www.cnblogs.com/xs-yqz/p/7243827.html
 */

var parseJsonWithErrors = require('json-parse-better-errors')
var parseJSON = module.exports = function (content) {
  return parseJsonWithErrors(stripBOM(content))
}

parseJSON.noExceptions = function (content) {
  try {
    return parseJSON(content)
  } catch (ex) {

  }
}

// from read-package-json
function stripBOM (content) {
  content = content.toString()    // 字节流转字符串
  // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
  // because the buffer-to-string conversion in `fs.readFileSync()`
  // translates it to FEFF, the UTF-16 BOM.
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  return content
}
