// Wrap src/client.js into the official DSH client-bundle wire format:
//   window.__ModuleLoader__.load({ id, factory: (require) => {
//     var module = { exports: {} }; <body>; return module.exports; } });
// 运行时把基座 require 传给 factory，body 里的 require("react") 由统一基座解析。
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.join(__dirname, '..', 'src', 'client.js')
const OUT = path.join(__dirname, '..', 'dist', 'client.js')
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))

const body = fs.readFileSync(SRC, 'utf8')
const wrapper =
  'window.__ModuleLoader__.load({\n' +
  '\tid: ' + JSON.stringify(PKG.name) + ',\n' +
  '\tfactory: (require) => {\n' +
  '\t\tvar module = { exports: {} };\n' +
  body + '\n' +
  '\t\treturn module.exports;\n' +
  '\t}\n' +
  '});\n'

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, wrapper, 'utf8')

// Syntax gate: the wrapped bundle must parse as a script.
new (require('node:vm').Script)(wrapper, { filename: 'dist/client.js' })
console.log('dist/client.js wrapped + parsed:', (wrapper.length / 1024).toFixed(1), 'KB')