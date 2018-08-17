#!/usr/bin/env node

const npx = require('libnpx')
const path = require('path')

// /Users/dkvirus/Documents/npm/bin/npm-cli.js
const NPM_PATH = path.join(__dirname, 'npm-cli.js')

npx(npx.parseArgs(process.argv, NPM_PATH))
