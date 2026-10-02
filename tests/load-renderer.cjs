const path = require('node:path')
const Module = require('node:module')
const { buildSync } = require('esbuild')

// Compile TypeScript fixtures on Node 22, without relying on native type stripping.
module.exports = function loadRenderer(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const output = buildSync({ entryPoints: [filename], bundle: true, platform: 'node',
    format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom'], write: false }).outputFiles[0].text
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(output, filename)
  return loaded.exports
}
