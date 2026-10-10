// Bundled fonts (curated set) + base styles
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/themes.css'
import './styles/main.css'
import './styles/editor.css'

import { createEditor } from './editor.js'
import { createPreview } from './preview.js'
import { createLayout } from './layout.js'
import { createTheme } from './theme.js'
import { initToolbar } from './toolbar.js'
import { createZoom } from './zoom.js'

const WELCOME = `# Welcome to Markdown Editor

A distraction-free editor with **live preview**.

## Getting started

- Type on the **left**, see it rendered on the **right**
- Use the toolbar or shortcuts: **Ctrl+B**, *Ctrl+I*, Ctrl+K for links
- Switch layouts: **Split**, **Editor**, **Preview** (Ctrl+1 / 2 / 3)
- Toggle light/dark with the moon button (Ctrl+Shift+T)

> Open a file with **Ctrl+O**, save with **Ctrl+S**.

\`\`\`js
console.log('Happy writing!')
\`\`\`
`

// ---- Document state ----
const state = {
  filePath: null,
  dirty: false,
  // The content baseline that "dirty" is measured against.
  savedContent: WELCOME
}

const fileNameEl = document.getElementById('status-filename')
const wordsEl = document.getElementById('status-words')
const refreshBtn = document.getElementById('status-refresh')

// Above this size (chars), live preview is paused while typing to avoid lag: the preview
// then updates on save, on a layout switch, or via the "Update preview" status button.
const LIVE_PREVIEW_LIMIT = 50000
// True when the editor content has diverged from what the preview currently shows.
let previewStale = false

function baseName(p) {
  return p ? p.split(/[\\/]/).pop() : 'Untitled'
}

function updateTitleAndStatus() {
  const name = baseName(state.filePath)
  const mark = state.dirty ? '● ' : ''
  document.title = `${mark}${name} — Markdown Editor`
  fileNameEl.textContent = `${mark}${name}`
}

function countWords(text) {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}

function setDirty(dirty) {
  if (state.dirty === dirty) return
  state.dirty = dirty
  window.api.setDirty(dirty)
  updateTitleAndStatus()
}

// The preview only matters (and only renders) when its pane is on screen.
function previewVisible() {
  const mode = layout.getMode()
  return mode === 'split' || mode === 'preview'
}

// Reflect whether the preview is out of date with the editor; surfaces the refresh button.
function markStale(stale) {
  previewStale = stale
  refreshBtn.hidden = !stale
}

// Force the preview to match the editor right now and clear the stale flag.
function refreshPreview() {
  preview.renderNow(editor.getContent())
  markStale(false)
}

// ---- Build UI ----
const editorMount = document.getElementById('editor')
const previewMount = document.getElementById('preview')

const preview = createPreview(previewMount)

const theme = createTheme({
  onThemeChange: (dark) => editor && editor.setTheme(dark)
})

const editor = createEditor({
  parent: editorMount,
  initialDoc: WELCOME,
  onChange: (content) => {
    // Always cheap: keep the word count and dirty state current.
    wordsEl.textContent = `${countWords(content)} words`
    setDirty(content !== state.savedContent)
    // Live-render only when the preview is visible and the file is small enough that
    // re-parsing on every keystroke stays smooth. Otherwise pause and mark it stale —
    // this also skips all preview work in Focus mode, where the pane is hidden.
    if (previewVisible() && content.length <= LIVE_PREVIEW_LIMIT) {
      preview.render(content)
      markStale(false)
    } else {
      markStale(previewVisible())
    }
  }
})

const layout = createLayout(document.getElementById('app'), {
  onChange: (mode) => {
    // Re-render immediately so the preview is fresh (and not stale) when revealed.
    if (mode === 'split' || mode === 'preview') refreshPreview()
  }
})

const zoom = createZoom()
zoom.init()

initToolbar({ editor, layout, theme })

// ---- Manual scroll sync (Overleaf-style pill on the divider) ----
const previewScroll = document.getElementById('preview-pane')

// → Scroll the preview to the position matching the editor's top visible line.
function syncPreviewToEditor() {
  const total = editor.lineCount()
  const ratio = total > 1 ? (editor.getFirstVisibleLine() - 1) / (total - 1) : 0
  const max = previewScroll.scrollHeight - previewScroll.clientHeight
  previewScroll.scrollTo({ top: ratio * max, behavior: 'smooth' })
}

// ← Scroll the editor to the line matching the preview's current top.
function syncEditorToPreview() {
  const max = previewScroll.scrollHeight - previewScroll.clientHeight
  const ratio = max > 0 ? previewScroll.scrollTop / max : 0
  const total = editor.lineCount()
  editor.scrollToLine(ratio * (total - 1) + 1)
}

document.getElementById('sync-to-preview').addEventListener('click', syncPreviewToEditor)
document.getElementById('sync-to-editor').addEventListener('click', syncEditorToPreview)

// "Update preview" button (visible only when a large file has paused live rendering).
refreshBtn.addEventListener('click', refreshPreview)

// Export the saved preview to a PDF next to the source .md file.
document.getElementById('export-pdf').addEventListener('click', exportPdf)

// ---- File operations ----
function confirmDiscardIfDirty() {
  if (!state.dirty) return true
  return window.confirm('You have unsaved changes. Discard them?')
}

// ---- Loading overlay (so big files don't look frozen on the welcome page) ----
const loadingOverlay = document.getElementById('loading-overlay')
const loadingLabel = document.getElementById('loading-label')
const loadingCard = loadingOverlay.querySelector('.loading-card')

function showLoading(label, { success = false } = {}) {
  loadingLabel.textContent = label
  loadingCard.classList.toggle('success', success)
  loadingOverlay.hidden = false
}
function hideLoading() {
  loadingOverlay.hidden = true
  loadingCard.classList.remove('success')
}
// Resolve after the browser has painted, so the overlay is visible before the
// synchronous (blocking) editor + preview render kicks in.
function afterPaint() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
}

// Files past this size make the synchronous render perceptible — show the overlay.
const HEAVY_THRESHOLD = 20000

async function loadContent(content, path) {
  const heavy = content.length > HEAVY_THRESHOLD
  const needsMath = !preview.mathReady && content.includes('$')
  if (heavy) {
    showLoading(path ? `Opening ${baseName(path)}…` : 'Loading…')
    await afterPaint()
    // Make sure math is ready before the (blocking) render, so formulas are
    // correct on the first pass instead of flickering in afterwards.
    if (needsMath) await preview.loadMath()
  }
  editor.setContent(content)
  state.filePath = path
  state.savedContent = content
  preview.renderNow(content)
  markStale(false)
  wordsEl.textContent = `${countWords(content)} words`
  setDirty(false)
  updateTitleAndStatus()
  if (heavy) hideLoading()
  // Small file with math: load it in the background; the preview re-renders itself
  // once KaTeX is ready (brief, no blocking).
  if (!heavy && needsMath) preview.loadMath()
  editor.focus()
}

function newFile() {
  if (!confirmDiscardIfDirty()) return
  loadContent('', null)
}

async function openFile() {
  if (!confirmDiscardIfDirty()) return
  const result = await window.api.openFile()
  if (result) loadContent(result.content, result.path)
}

async function saveFile() {
  let path = state.filePath
  if (!path) {
    path = await window.api.chooseSavePath()
    if (!path) return
  }
  const content = editor.getContent()
  await window.api.saveFile(path, content)
  state.filePath = path
  state.savedContent = content
  setDirty(false)
  updateTitleAndStatus()
  // Saving is the user's cue to bring a paused (large-file) preview up to date.
  if (previewStale) refreshPreview()
}

async function saveFileAs() {
  const path = await window.api.chooseSavePath()
  if (!path) return
  const content = editor.getContent()
  await window.api.saveFile(path, content)
  state.filePath = path
  state.savedContent = content
  setDirty(false)
  updateTitleAndStatus()
  if (previewStale) refreshPreview()
}

// ---- Export to PDF ----
// Derive the PDF path from the .md path: same folder, same name, .pdf extension.
function pdfPathFor(mdPath) {
  return `${mdPath.replace(/\.[^./\\]+$/, '')}.pdf`
}

async function exportPdf() {
  if (!state.filePath) {
    window.alert('Save the file first — the PDF is written next to the .md file.')
    return
  }
  const outPath = pdfPathFor(state.filePath)
  // The overlay covers the preview while we swap in the saved content and print, so the
  // on-screen view never visibly flickers (the overlay is hidden in the PDF via print CSS).
  showLoading('Exporting PDF…')
  await afterPaint()

  // Export the *saved* version of the document, not any unsaved edits.
  if (state.savedContent.includes('$') && !preview.mathReady) await preview.loadMath()
  const restore = previewMount.innerHTML
  preview.renderNow(state.savedContent)
  // Apply the export styling (light palette, full-width preview, white page, chrome hidden)
  // to the live DOM so printToPDF captures it — the overlay hides this reflow on screen.
  document.documentElement.classList.add('exporting')
  await afterPaint() // let the saved render (incl. KaTeX) + export layout settle before capturing

  const res = await window.api.exportPdf(outPath)

  document.documentElement.classList.remove('exporting')
  previewMount.innerHTML = restore // put the exact prior preview back
  if (res && res.ok) {
    showLoading(`✓ Saved ${baseName(outPath)}`, { success: true })
    setTimeout(hideLoading, 1100)
  } else {
    hideLoading()
    window.alert(`PDF export failed${res && res.error ? `:\n${res.error}` : '.'}`)
  }
}

// ---- Native menu wiring ----
window.api.onMenu('new', newFile)
window.api.onMenu('open', openFile)
window.api.onMenu('save', saveFile)
window.api.onMenu('save-as', saveFileAs)
window.api.onMenu('mode', (mode) => layout.setMode(mode))
window.api.onMenu('toggle-theme', () => theme.toggle())
window.api.onMenu('zoom', (dir) => {
  if (dir === 'in') zoom.zoomIn()
  else if (dir === 'out') zoom.zoomOut()
  else zoom.reset()
})

// File opened from the OS (default .md handler / command line)
window.api.onOpenFile(({ path, content }) => {
  if (!confirmDiscardIfDirty()) return
  loadContent(content, path)
})

// ---- Init ----
async function start() {
  await theme.init()
  layout.init()
  preview.renderNow(WELCOME)
  wordsEl.textContent = `${countWords(WELCOME)} words`
  updateTitleAndStatus()
  editor.focus()

  // Warm up math rendering in the background once the app is interactive, so it's
  // ready by the time a file with formulas is opened (without slowing cold start).
  const whenIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300))
  whenIdle(() => preview.loadMath())
}

start()
