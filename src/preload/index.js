import { contextBridge, ipcRenderer, webFrame } from 'electron'

// Whitelisted menu channels the renderer may subscribe to.
const MENU_CHANNELS = [
  'menu:new',
  'menu:open',
  'menu:save',
  'menu:save-as',
  'menu:mode',
  'menu:toggle-theme',
  'menu:zoom'
]

const api = {
  // File operations
  openFile: () => ipcRenderer.invoke('dialog:open'),
  saveFile: (path, content) => ipcRenderer.invoke('file:save', { path, content }),
  chooseSavePath: () => ipcRenderer.invoke('dialog:save-as'),

  // Export the current page (preview, via print CSS) to a PDF at outPath
  exportPdf: (outPath) => ipcRenderer.invoke('pdf:export', { outPath }),

  // Theme
  getOSTheme: () => ipcRenderer.invoke('theme:get'),
  onOSThemeChange: (callback) => {
    const handler = (_event, isDark) => callback(isDark)
    ipcRenderer.on('theme:os-changed', handler)
    return () => ipcRenderer.removeListener('theme:os-changed', handler)
  },

  // Native menu → renderer events
  onMenu: (action, callback) => {
    const channel = `menu:${action}`
    if (!MENU_CHANNELS.includes(channel)) return () => {}
    const handler = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  // A file opened from the OS (e.g. as the default .md handler) pushed by main
  onOpenFile: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('file:open-path', handler)
    return () => ipcRenderer.removeListener('file:open-path', handler)
  },

  // Browser-style page zoom
  zoom: {
    set: (factor) => webFrame.setZoomFactor(factor),
    get: () => webFrame.getZoomFactor()
  },

  // Inform main of unsaved-changes state (guards window close)
  setDirty: (dirty) => ipcRenderer.send('doc:dirty', dirty)
}

contextBridge.exposeInMainWorld('api', api)
