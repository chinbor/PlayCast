const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('liveTool', {
  initialAppearance: process.argv.includes('--playcast-main-window') ? ipcRenderer.sendSync('appearance:initial') : null,
  getAppearance: () => ipcRenderer.invoke('appearance:get'),
  setAppearance: mode => ipcRenderer.invoke('appearance:set', mode),
  onAppearance: callback => { const listener = (_e, value) => callback(value); ipcRenderer.on('appearance:changed', listener); return () => ipcRenderer.removeListener('appearance:changed', listener) },
  getResetState: () => ipcRenderer.invoke('application:reset-state'),
  onResetState: callback => { const listener = (_e, value) => callback(value); ipcRenderer.on('application:reset', listener); return () => ipcRenderer.removeListener('application:reset', listener) },
  getMainVisibility: () => ipcRenderer.invoke('product:main-visibility'),
  onMainVisibility: callback => { const listener = (_e, value) => callback(value); ipcRenderer.on('product:main-visibility', listener); return () => ipcRenderer.removeListener('product:main-visibility', listener) },
  getProduct: () => ipcRenderer.invoke('product:get'),
  productQuery: (type, options, contextVersion) => ipcRenderer.invoke('product:query', type, options, contextVersion),
  subscribeGameData: (active, contextVersion) => ipcRenderer.invoke('collector:subscribe', active, contextVersion),
  action: (type, value) => ipcRenderer.invoke('product:action', type, value),
  displayControl: (kind, command, value, contextVersion) => ipcRenderer.invoke('display:control', kind, command, value, contextVersion),
  setDisplayCloseGuard: (kind, enabled, contextVersion) => ipcRenderer.invoke('display:close-guard', kind, enabled, contextVersion),
  setMainCloseGuard: (enabled, contextVersion) => ipcRenderer.invoke('main:close-guard', enabled, contextVersion),
  answerMainClose: (id, approved, contextVersion) => ipcRenderer.invoke('main:close-answer', id, approved, contextVersion),
  answerDisplayClose: (kind, id, approved, contextVersion) => ipcRenderer.invoke('display:close-answer', kind, id, approved, contextVersion),
  onDisplayCloseRequest: callback => { const listener = (_e, request) => callback(request); ipcRenderer.on('display:close-request', listener); return () => ipcRenderer.removeListener('display:close-request', listener) },
  onDisplayCloseComplete: callback => { const listener = (_e, request) => callback(request); ipcRenderer.on('display:close-complete', listener); return () => ipcRenderer.removeListener('display:close-complete', listener) },
  displayFeed: (cursor, contextVersion) => ipcRenderer.invoke('display:feed', cursor, contextVersion),
  getGame: () => ipcRenderer.invoke('collector:get'),
  onProduct: callback => { const listener = (_e, data) => callback(data); ipcRenderer.on('product:state', listener); return () => ipcRenderer.removeListener('product:state', listener) },
  onContextChange: callback => { const listener = (_e, version, metadata) => callback(version, metadata); ipcRenderer.on('product:context', listener); return () => ipcRenderer.removeListener('product:context', listener) },
  onCorrection: callback => { const listener = () => callback(); ipcRenderer.on('product:correction', listener); return () => ipcRenderer.removeListener('product:correction', listener) },
  onError: callback => { const listener = (_e, text) => callback(text); ipcRenderer.on('product:error', listener); return () => ipcRenderer.removeListener('product:error', listener) },
  subscribe: callback => {
    const listener = (_event, snapshot) => callback(snapshot)
    ipcRenderer.on('collector:snapshot', listener)
    return () => ipcRenderer.removeListener('collector:snapshot', listener)
  }
})
