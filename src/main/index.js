import { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme } from 'electron'
import { join, resolve } from 'path'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'

// The app supports multiple independent windows. Per-window state (unsaved changes, a
// force-close flag) lives on the BrowserWindow instance itself (win._isDirty / win._forceClose)
// rather than in module globals, so each window guards its own close independently.

// Find a markdown/text file path among the launch arguments.
function getFileFromArgs(argv) {
  for (const arg of argv.slice(1)) {
    if (!arg || arg.startsWith('-') || arg === '.') continue
    if (/\.(md|markdown|mdown|mkd|txt)$/i.test(arg)) {
      const abs = resolve(arg)
      if (existsSync(abs)) return abs
    }
  }
  return null
}

// Read a file and hand it to a specific window to display.
async function openPathInWindow(win, path) {
  if (!win || win.isDestroyed()) return
  try {
    const content = await readFile(path, 'utf-8')
    win.webContents.send('file:open-path', { path, content })
  } catch (err) {
    console.error('Failed to open file:', path, err)
  }
}

const FILE_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
  { name: 'Text', extensions: ['txt'] },
  { name: 'All Files', extensions: ['*'] }
]

// Create a new editor window. If `file` is given, it's opened once the UI has loaded.
function createWindow(file = null) {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 640,
    minHeight: 460,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1a1b26' : '#ffffff',
    title: 'Markdown Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win._isDirty = false
  win._forceClose = false

  win.once('ready-to-show', () => win.show())

  // Once the UI is ready, open any file this window was launched with.
  win.webContents.once('did-finish-load', () => {
    if (file) openPathInWindow(win, file)
  })

  win.on('close', async (event) => {
    if (!win._isDirty || win._forceClose) return
    event.preventDefault()
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Discard & Close', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'You have unsaved changes.',
      detail: 'Are you sure you want to close without saving?'
    })
    if (response === 0) {
      win._forceClose = true
      win.close()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Send a menu/event to the window the user is currently working in.
function sendToFocused(channel, ...args) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

// Broadcast to every open window (used for OS-theme changes).
function broadcast(channel, ...args) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin'
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => sendToFocused('menu:new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => sendToFocused('menu:open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendToFocused('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendToFocused('menu:save-as') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Split View', accelerator: 'CmdOrCtrl+1', click: () => sendToFocused('menu:mode', 'split') },
        { label: 'Editor Only (Focus)', accelerator: 'CmdOrCtrl+2', click: () => sendToFocused('menu:mode', 'focus') },
        { label: 'Preview Only', accelerator: 'CmdOrCtrl+3', click: () => sendToFocused('menu:mode', 'preview') },
        { type: 'separator' },
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+Shift+T', click: () => sendToFocused('menu:toggle-theme') },
        { type: 'separator' },
        { label: 'Zoom In  (Ctrl +)', click: () => sendToFocused('menu:zoom', 'in') },
        { label: 'Zoom Out  (Ctrl −)', click: () => sendToFocused('menu:zoom', 'out') },
        { label: 'Reset Zoom  (Ctrl 0)', click: () => sendToFocused('menu:zoom', 'reset') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---- IPC: file operations (scoped to the window that made the request) ----
ipcMain.handle('dialog:open', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: FILE_FILTERS
  })
  if (canceled || filePaths.length === 0) return null
  const path = filePaths[0]
  const content = await readFile(path, 'utf-8')
  return { path, content }
})

ipcMain.handle('dialog:save-as', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    filters: FILE_FILTERS,
    defaultPath: 'untitled.md'
  })
  if (canceled || !filePath) return null
  return filePath
})

ipcMain.handle('file:save', async (_event, { path, content }) => {
  await writeFile(path, content, 'utf-8')
  return true
})

// Render the requesting window's page to PDF. The renderer adds an `exporting` class that
// strips the editor/toolbar/status bar and forces a light, full-width preview, so only the
// preview is captured; the file is written next to the source .md by the caller-supplied path.
// printToPDF paints the page-margin area with the WINDOW's backgroundColor (dark in dark
// mode), so we flip it to white for the capture and restore it afterwards — otherwise the
// PDF gets a dark border around every page.
ipcMain.handle('pdf:export', async (event, { outPath }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  try {
    if (win) win.setBackgroundColor('#ffffff')
    const data = await event.sender.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    })
    await writeFile(outPath, data)
    return { ok: true, path: outPath }
  } catch (err) {
    console.error('PDF export failed:', err)
    return { ok: false, error: String(err && err.message ? err.message : err) }
  } finally {
    // Restore the theme-appropriate window background.
    if (win) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1a1b26' : '#ffffff')
  }
})

// ---- IPC: theme ----
ipcMain.handle('theme:get', () => nativeTheme.shouldUseDarkColors)

nativeTheme.on('updated', () => {
  broadcast('theme:os-changed', nativeTheme.shouldUseDarkColors)
})

// ---- IPC: dirty state (per window) ----
ipcMain.on('doc:dirty', (event, dirty) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win._isDirty = Boolean(dirty)
})

// Single process, multiple windows: a second launch (e.g. opening another .md from the
// file manager) opens a NEW window in the existing process rather than starting over.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const file = getFileFromArgs(argv)
    if (file) {
      createWindow(file)
    } else {
      // No file: just surface an existing window (or make one).
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      } else {
        createWindow()
      }
    }
  })

  app.whenReady().then(() => {
    buildMenu()
    createWindow(getFileFromArgs(process.argv))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
