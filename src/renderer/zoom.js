// Browser-style zoom for the whole UI via Electron's page zoom (webFrame.setZoomFactor),
// controlled with Ctrl +/-/0 and Ctrl+scroll, and persisted across restarts.
const ZOOM_KEY = 'md:zoom'
const MIN = 0.5
const MAX = 3
const STEP = 0.1
const DEFAULT = 1

function clampFactor(f) {
  return Math.min(MAX, Math.max(MIN, Math.round(f * 100) / 100))
}

export function createZoom() {
  let factor = parseFloat(localStorage.getItem(ZOOM_KEY))
  if (!Number.isFinite(factor)) factor = DEFAULT

  const indicator = document.getElementById('status-zoom')

  function apply() {
    window.api.zoom.set(factor)
    if (indicator) indicator.textContent = `${Math.round(factor * 100)}%`
    localStorage.setItem(ZOOM_KEY, String(factor))
  }

  function setFactor(f) {
    factor = clampFactor(f)
    apply()
  }

  const zoomIn = () => setFactor(factor + STEP)
  const zoomOut = () => setFactor(factor - STEP)
  const reset = () => setFactor(DEFAULT)

  function init() {
    apply()

    // Capture phase so zoom keys win even when the editor has focus.
    window.addEventListener(
      'keydown',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          e.stopPropagation()
          zoomIn()
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          e.stopPropagation()
          zoomOut()
        } else if (e.key === '0') {
          e.preventDefault()
          e.stopPropagation()
          reset()
        }
      },
      true
    )

    // Ctrl + mouse wheel, just like a browser.
    window.addEventListener(
      'wheel',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        if (e.deltaY < 0) zoomIn()
        else zoomOut()
      },
      { passive: false }
    )

    if (indicator) indicator.addEventListener('click', reset)
  }

  return { init, zoomIn, zoomOut, reset }
}
