import { onScopeDispose, ref, type Ref } from 'vue'

export const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

export function useMediaQuery(query: string): Readonly<Ref<boolean>> {
  const mediaQuery =
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? null
      : window.matchMedia(query)
  const matches = ref(mediaQuery?.matches ?? false)

  function update(event: MediaQueryListEvent): void {
    matches.value = event.matches
  }

  mediaQuery?.addEventListener('change', update)
  onScopeDispose(() => mediaQuery?.removeEventListener('change', update))

  return matches
}
