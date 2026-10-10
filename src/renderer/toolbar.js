/**
 * Wires the toolbar's formatting buttons to editor commands and the
 * layout buttons to the layout controller.
 */
export function initToolbar({ editor, layout, theme }) {
  document.querySelectorAll('#format-group .tb-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd
      if (editor.commands[cmd]) editor.commands[cmd]()
    })
  })

  document.querySelectorAll('#layout-group .tb-btn').forEach((btn) => {
    btn.addEventListener('click', () => layout.setMode(btn.dataset.mode))
  })

  document.getElementById('theme-toggle').addEventListener('click', () => theme.toggle())
}
