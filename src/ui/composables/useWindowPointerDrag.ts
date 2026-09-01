import { onScopeDispose } from 'vue'

type PointerMoveHandler = (event: PointerEvent) => void

export function useWindowPointerDrag(): {
  start: (moveHandler: PointerMoveHandler) => void
  stop: () => void
} {
  let activeMoveHandler: PointerMoveHandler | null = null

  function handleMove(event: PointerEvent): void {
    activeMoveHandler?.(event)
  }

  function stop(): void {
    activeMoveHandler = null
    if (typeof window === 'undefined') return
    window.removeEventListener('pointermove', handleMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    window.removeEventListener('blur', stop)
  }

  function start(moveHandler: PointerMoveHandler): void {
    stop()
    activeMoveHandler = moveHandler
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('blur', stop)
  }

  onScopeDispose(stop)

  return { start, stop }
}
