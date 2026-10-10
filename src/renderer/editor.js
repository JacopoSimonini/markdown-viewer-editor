import { EditorState, EditorSelection, Compartment } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view'
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'

// Compartment lets us swap the editor theme (light/dark) without rebuilding state.
const themeCompartment = new Compartment()

// Base look-and-feel; font is driven by the --editor-font CSS variable.
const baseTheme = EditorView.theme({
  // Font scales fluidly with the editor pane's width (cqi = 1% of container inline-size),
  // clamped so it stays readable at extreme window sizes.
  '&': { height: '100%', fontSize: 'clamp(12px, 1.8cqi, 20px)' },
  '.cm-scroller': {
    fontFamily: 'var(--editor-font)',
    lineHeight: '1.7',
    padding: '8px 4px'
  },
  '.cm-content': { caretColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0 16px' }
})

/**
 * Wrap (or unwrap) each selection range with `marker`, e.g. ** for bold.
 */
function toggleWrap(view, marker) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const { state } = view
      const before = state.sliceDoc(range.from - marker.length, range.from)
      const after = state.sliceDoc(range.to, range.to + marker.length)
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - marker.length, to: range.from },
            { from: range.to, to: range.to + marker.length }
          ],
          range: EditorSelection.range(range.from - marker.length, range.to - marker.length)
        }
      }
      const text = state.sliceDoc(range.from, range.to)
      return {
        changes: { from: range.from, to: range.to, insert: marker + text + marker },
        range: EditorSelection.range(range.from + marker.length, range.to + marker.length)
      }
    })
  )
  view.focus()
}

function selectedLineNumbers(state) {
  const lines = []
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) if (!lines.includes(n)) lines.push(n)
  }
  return lines
}

/**
 * Toggle a line prefix (e.g. "# " or "- ") on every selected line.
 */
function toggleLinePrefix(view, prefix) {
  const { state } = view
  const lineNums = selectedLineNumbers(state)
  const allPrefixed = lineNums.every((n) => state.doc.line(n).text.startsWith(prefix))
  const changes = []
  for (const n of lineNums) {
    const line = state.doc.line(n)
    if (allPrefixed) {
      changes.push({ from: line.from, to: line.from + prefix.length })
    } else if (!line.text.startsWith(prefix)) {
      changes.push({ from: line.from, insert: prefix })
    }
  }
  if (changes.length) view.dispatch({ changes })
  view.focus()
}

function insertLink(view) {
  view.dispatch(
    view.state.changeByRange((range) => {
      const text = view.state.sliceDoc(range.from, range.to) || 'text'
      const insert = `[${text}](url)`
      const urlStart = range.from + text.length + 3 // past "[text]("
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(urlStart, urlStart + 3)
      }
    })
  )
  view.focus()
}

export function createEditor({ parent, initialDoc = '', onChange, isDark = false }) {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && onChange) onChange(view.state.doc.toString())
  })

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      history(),
      drawSelection(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        { key: 'Mod-b', run: () => (toggleWrap(view, '**'), true) },
        { key: 'Mod-i', run: () => (toggleWrap(view, '*'), true) },
        { key: 'Mod-h', run: () => (toggleLinePrefix(view, '# '), true) },
        { key: 'Mod-k', run: () => (insertLink(view), true) },
        indentWithTab,
        ...historyKeymap,
        ...defaultKeymap
      ]),
      baseTheme,
      themeCompartment.of(isDark ? oneDark : []),
      updateListener
    ]
  })

  const view = new EditorView({ state, parent })

  const commands = {
    bold: () => toggleWrap(view, '**'),
    italic: () => toggleWrap(view, '*'),
    code: () => toggleWrap(view, '`'),
    heading: () => toggleLinePrefix(view, '# '),
    list: () => toggleLinePrefix(view, '- '),
    link: () => insertLink(view)
  }

  return {
    view,
    commands,
    get scrollDOM() {
      return view.scrollDOM
    },
    getContent: () => view.state.doc.toString(),
    setContent: (text) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text }
      })
    },
    lineCount: () => view.state.doc.lines,
    // 1-based line number currently at the top of the visible editor viewport.
    getFirstVisibleLine: () => {
      const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
      return view.state.doc.lineAt(block.from).number
    },
    // Smoothly scroll the editor so `line` sits at the top of the viewport.
    scrollToLine: (line) => {
      const total = view.state.doc.lines
      const clamped = Math.max(1, Math.min(total, Math.round(line)))
      const pos = view.state.doc.line(clamped).from
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) })
    },
    setTheme: (dark) => {
      view.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) })
    },
    focus: () => view.focus()
  }
}
