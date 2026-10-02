const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildSync } = require('esbuild')

test('production renderer selects lazy window entries and excludes browser preview', () => {
  const root = path.resolve(__dirname, '..')
  const { metafile } = buildSync({ absWorkingDir: root, entryPoints: ['src/main.tsx'],
    outdir: 'renderer-entry-test', bundle: true, splitting: true, platform: 'browser', format: 'esm',
    jsx: 'automatic', write: false, metafile: true, loader: { '.css': 'empty' },
    external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'virtual:uno.css'],
    define: { 'import.meta.env.DEV': 'false', 'import.meta.hot': 'undefined' } })
  assert.equal(Object.keys(metafile.inputs).some(file => file.includes('browser-preview')), false)
  const entry = metafile.inputs['src/main.tsx']
  assert.deepEqual(entry.imports.filter(item => !item.external).map(item => [item.path, item.kind]), [
    ['src/entries/settings.tsx', 'dynamic-import'],
    ['src/entries/display.tsx', 'dynamic-import'],
    ['src/entries/workspace.tsx', 'dynamic-import']
  ])
  function reachable(file, visited = new Set()) {
    if (visited.has(file)) return visited
    visited.add(file)
    for (const item of metafile.inputs[file]?.imports || []) {
      if (!item.external && item.kind !== 'dynamic-import') reachable(item.path, visited)
    }
    return visited
  }
  const settings = reachable('src/entries/settings.tsx')
  const display = reachable('src/entries/display.tsx')
  const workspace = reachable('src/entries/workspace.tsx')
  assert.equal(settings.has('src/App.tsx'), false)
  assert.equal(settings.has('src/components/DisplayWindow.tsx'), false)
  assert.equal(settings.has('src/components/OverlayDisplay.tsx'), false)
  assert.equal(settings.has('src/components/MessageDisplay.tsx'), false)
  assert.equal(display.has('src/App.tsx'), false)
  assert.equal(display.has('src/components/DisplaySettingsWindow.tsx'), false)
  assert.equal(workspace.has('src/components/DisplayWindow.tsx'), false)
})
