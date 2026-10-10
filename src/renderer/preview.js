import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true
})

// Open links in the user's default browser rather than navigating the app window.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// KaTeX (~280 kB JS + its CSS) is the heaviest dependency but isn't needed for the
// first paint, so we load it lazily after startup. Until it's ready, Markdown still
// renders — formulas just show as raw $…$ until the math pass is wired in, then we
// re-render. This keeps cold-start fast.
let mathReady = false
let mathLoading = null
let rerenderOnMathReady = null

function loadMath() {
  if (mathLoading) return mathLoading
  mathLoading = Promise.all([import('marked-katex-extension'), import('katex/dist/katex.css')])
    .then(([{ default: markedKatex }]) => {
      marked.use(
        markedKatex({
          throwOnError: false,
          nonStandard: true, // allow $…$ without requiring surrounding whitespace
          output: 'html' // skip the parallel MathML tree — visually identical, ~half the work
        })
      )
      mathReady = true
      if (rerenderOnMathReady) rerenderOnMathReady()
    })
    .catch((err) => console.error('Failed to load math rendering:', err))
  return mathLoading
}

export function createPreview(container) {
  let timer = null
  let lastText = ''

  function renderNow(markdownText) {
    lastText = markdownText || ''
    const rawHtml = marked.parse(lastText)
    container.innerHTML = DOMPurify.sanitize(rawHtml)
  }

  function render(markdownText, { immediate = false } = {}) {
    if (immediate) {
      if (timer) clearTimeout(timer)
      renderNow(markdownText)
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => renderNow(markdownText), 90)
  }

  // When KaTeX finishes loading, re-render the current document so formulas appear.
  rerenderOnMathReady = () => renderNow(lastText)

  return {
    render,
    renderNow,
    loadMath,
    get mathReady() {
      return mathReady
    }
  }
}
