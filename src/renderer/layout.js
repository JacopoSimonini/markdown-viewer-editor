const MODES = ['split', 'focus', 'preview']
const STORAGE_KEY = 'md:layout-mode'

/**
 * Manages the Split / Focus (editor only) / Preview-only layout modes.
 * The active mode is reflected as `data-mode` on the #app element and persisted.
 */
export function createLayout(appEl, { onChange } = {}) {
  function setMode(mode) {
    if (!MODES.includes(mode)) return
    appEl.dataset.mode = mode
    localStorage.setItem(STORAGE_KEY, mode)
    document.querySelectorAll('#layout-group .tb-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode)
    })
    if (onChange) onChange(mode)
  }

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY)
    setMode(MODES.includes(saved) ? saved : 'split')
  }

  return { setMode, init, getMode: () => appEl.dataset.mode }
}
