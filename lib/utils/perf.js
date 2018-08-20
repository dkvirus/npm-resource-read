'use strict'
var log = require('npmlog')
var EventEmitter = require('events').EventEmitter
var perf = new EventEmitter()
module.exports = perf

/**
 * 看代码就是 console.time('xx') + console.timeEnd('xx') 的具体实现呗
 * 为啥？？node原生不支持这两个 api 吗？测试是支持这两个方法的。
 * 那可能是历史遗留代码，早在 node 刚诞生不支持这两个方法才写的这个文件？？也许是这样
 */

var timings = {}

// process 对象是 EventEmitter 的实例对象，因此也有 on 和 emit 方法
process.on('time', time)
process.on('timeEnd', timeEnd)

// 注册了两个事件：time、timeEnd
perf.on('time', time)
perf.on('timeEnd', timeEnd)

function time (name) {
  timings[name] = Date.now()
}

function timeEnd (name) {
  if (name in timings) {
    perf.emit('timing', name, Date.now() - timings[name])
    delete timings[name]
  } else {
    log.silly('timing', "Tried to end timer that doesn't exist:", name)
  }
}
