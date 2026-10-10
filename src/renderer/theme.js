const THEME_KEY = 'md:theme-override' // 'light' | 'dark' | null (follow OS)
const EDITOR_FONT_KEY = 'md:editor-font'
const PREVIEW_FONT_KEY = 'md:preview-font'

export const EDITOR_FONTS = [
  { label: 'JetBrains Mono', value: "'JetBrains Mono', ui-monospace, monospace" },
  { label: 'System Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" }
]

export const PREVIEW_FONTS = [
  { label: 'Inter', value: "'Inter', system-ui, sans-serif" },
  { label: 'Georgia (Serif)', value: 'Georgia, Cambria, "Times New Roman", serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }
]

export function createTheme({ onThemeChange } = {}) {
  const root = document.documentElement
  let override = localStorage.getItem(THEME_KEY) // null = follow OS
  let osDark = false

  function effectiveDark() {
    if (override === 'dark') return true
    if (override === 'light') return false
    return osDark
  }

  function apply() {
    const dark = effectiveDark()
    root.dataset.theme = dark ? 'dark' : 'light'
    const toggle = document.getElementById('theme-toggle')
    if (toggle) toggle.innerHTML = dark ? '&#9728;' : '&#9790;' // sun / moon
    if (onThemeChange) onThemeChange(dark)
  }

  async function init() {
    osDark = await window.api.getOSTheme()
    window.api.onOSThemeChange((isDark) => {
      osDark = isDark
      apply() // only changes appearance when following the OS
    })
    apply()
    initFonts()
  }

  function toggle() {
    // Manual toggle pins an override and stops following the OS.
    override = effectiveDark() ? 'light' : 'dark'
    localStorage.setItem(THEME_KEY, override)
    apply()
  }

  // ---- Fonts ----
  function applyFont(varName, value) {
    root.style.setProperty(varName, value)
  }

  function initFonts() {
    const editorSel = document.getElementById('editor-font')
    const previewSel = document.getElementById('preview-font')

    fillSelect(editorSel, EDITOR_FONTS)
    fillSelect(previewSel, PREVIEW_FONTS)

    const savedEditor = localStorage.getItem(EDITOR_FONT_KEY) || EDITOR_FONTS[0].value
    const savedPreview = localStorage.getItem(PREVIEW_FONT_KEY) || PREVIEW_FONTS[0].value
    editorSel.value = savedEditor
    previewSel.value = savedPreview
    applyFont('--editor-font', savedEditor)
    applyFont('--preview-font', savedPreview)

    editorSel.addEventListener('change', () => {
      applyFont('--editor-font', editorSel.value)
      localStorage.setItem(EDITOR_FONT_KEY, editorSel.value)
    })
    previewSel.addEventListener('change', () => {
      applyFont('--preview-font', previewSel.value)
      localStorage.setItem(PREVIEW_FONT_KEY, previewSel.value)
    })
  }

  function fillSelect(select, fonts) {
    select.innerHTML = ''
    for (const font of fonts) {
      const opt = document.createElement('option')
      opt.value = font.value
      opt.textContent = font.label
      select.appendChild(opt)
    }
  }

  return { init, toggle, isDark: effectiveDark }
}
