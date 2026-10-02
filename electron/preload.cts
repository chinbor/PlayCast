import { contextBridge, ipcRenderer } from 'electron';

import type { IpcRendererEvent } from 'electron';
import type { LiveTool } from '../shared/ipc.js';

function listen<T extends unknown[]>(channel: string, callback: (...args: T) => void) {
  const listener = (_event: IpcRendererEvent, ...args: T) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

const api: LiveTool = {
  initialAppearance: process.argv.includes('--playcast-main-window') ? ipcRenderer.sendSync('appearance:initial') : null,
  getAppearance: () => ipcRenderer.invoke('appearance:get'),
  setAppearance: mode => ipcRenderer.invoke('appearance:set', mode),
  onAppearance: callback => listen('appearance:changed', callback),
  getResetState: () => ipcRenderer.invoke('application:reset-state'),
  onResetState: callback => listen('application:reset', callback),
  getMainVisibility: () => ipcRenderer.invoke('product:main-visibility'),
  onMainVisibility: callback => listen('product:main-visibility', callback),
  getProduct: () => ipcRenderer.invoke('product:get'),
  productQuery: (type, options, contextVersion) => ipcRenderer.invoke('product:query', type, options, contextVersion),
  subscribeGameData: (active, contextVersion) => ipcRenderer.invoke('collector:subscribe', active, contextVersion),
  action: (type, ...args) => ipcRenderer.invoke('product:action', type, args[0]),
  displayControl: (kind, command, ...args) => ipcRenderer.invoke('display:control', kind, command, args[0], args[1]),
  setDisplayCloseGuard: (kind, enabled, contextVersion) => ipcRenderer.invoke('display:close-guard', kind, enabled, contextVersion),
  setMainCloseGuard: (enabled, contextVersion) => ipcRenderer.invoke('main:close-guard', enabled, contextVersion),
  answerMainClose: (id, approved, contextVersion) => ipcRenderer.invoke('main:close-answer', id, approved, contextVersion),
  answerDisplayClose: (kind, id, approved, contextVersion) => ipcRenderer.invoke('display:close-answer', kind, id, approved, contextVersion),
  onDisplayCloseRequest: callback => listen('display:close-request', callback),
  onDisplayCloseComplete: callback => listen('display:close-complete', callback),
  displayFeed: (cursor, contextVersion) => ipcRenderer.invoke('display:feed', cursor, contextVersion),
  getGame: () => ipcRenderer.invoke('collector:get'),
  onProduct: callback => listen('product:state', callback),
  onContextChange: callback => listen('product:context', callback),
  onCorrection: callback => listen('product:correction', callback),
  onError: callback => listen('product:error', callback),
  subscribe: callback => listen('collector:snapshot', callback)
};

contextBridge.exposeInMainWorld('liveTool', api);
