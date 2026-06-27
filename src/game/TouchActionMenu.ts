// Touch action popover for AstroHold's mobile BUILD flow.
//
// Touch devices have no right-click, so tapping a placed piece during BUILD
// opens this small floating menu beside it with only the actions that apply:
//   Aim    - open the fire-arc compass rose (non-wall firing structures)
//   Rotate - rotate a wall 90 degrees
//   Remove - refund / remove any piece
// Mouse players never see it: it is only invoked from the touch path in Game.
//
// Self-contained DOM with scoped styles (#ah-touch-menu*), so it does NOT touch
// the frozen HUD CSS or the index.html <style> block.

export type TouchAction = { label: string; onSelect: () => void }

let menuEl: HTMLDivElement | null = null
let outsideHandler: ((e: Event) => void) | null = null

export function isTouchActionMenuOpen(): boolean {
  return menuEl !== null
}

export function closeTouchActionMenu(): void {
  if (outsideHandler) {
    window.removeEventListener('pointerdown', outsideHandler, true)
    outsideHandler = null
  }
  menuEl?.remove()
  menuEl = null
}

export function openTouchActionMenu(
  clientX: number,
  clientY: number,
  actions: TouchAction[],
): void {
  closeTouchActionMenu()
  if (!actions.length) return
  injectStyles()

  const el = document.createElement('div')
  el.id = 'ah-touch-menu'
  for (const a of actions) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'ah-tm-btn'
    btn.textContent = a.label
    btn.addEventListener('click', () => {
      a.onSelect()
      closeTouchActionMenu()
    })
    el.appendChild(btn)
  }
  document.body.appendChild(el)

  // Position beside the tap, clamped to stay fully on-screen.
  const pad = 8
  const rect = el.getBoundingClientRect()
  let x = clientX + 14
  let y = clientY - rect.height / 2
  if (x + rect.width + pad > window.innerWidth) x = clientX - rect.width - 14
  x = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad))
  y = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad))
  el.style.left = x + 'px'
  el.style.top = y + 'px'

  menuEl = el

  // Close on any tap outside the menu (including over the HUD). Capture phase
  // so it runs before other handlers. Deferred registration so the opening
  // tap still in flight does not immediately dismiss it.
  outsideHandler = (e: Event) => {
    if (menuEl && !menuEl.contains(e.target as Node)) closeTouchActionMenu()
  }
  window.setTimeout(() => {
    if (outsideHandler) window.addEventListener('pointerdown', outsideHandler, true)
  }, 0)
}

function injectStyles(): void {
  if (document.getElementById('ah-touch-menu-style')) return
  const style = document.createElement('style')
  style.id = 'ah-touch-menu-style'
  style.textContent = `
    #ah-touch-menu {
      position: fixed; z-index: 2147483600;
      display: flex; flex-direction: column; gap: 4px;
      padding: 6px;
      background: rgba(10, 20, 38, 0.96);
      border: 1px solid #2c4a6e; border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.55);
      font-family: 'Orbitron', system-ui, sans-serif;
    }
    #ah-touch-menu .ah-tm-btn {
      min-width: 108px;
      padding: 11px 16px;
      font: 700 13px 'Orbitron', system-ui, sans-serif; letter-spacing: 1.5px;
      color: #eaf3ff; text-align: left; cursor: pointer;
      background: #162b3f;
      border: 1px solid #2c4a6e; border-radius: 7px;
      -webkit-tap-highlight-color: transparent;
    }
    #ah-touch-menu .ah-tm-btn:active { background: #1f3b58; }
  `
  document.head.appendChild(style)
}
