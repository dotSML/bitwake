let currentEpoch = 0
let activeController = new AbortController()

export function authenticationEpoch(): number {
  return currentEpoch
}

export function authenticationSignal(): AbortSignal {
  return activeController.signal
}

export function advanceAuthenticationEpoch(): number {
  currentEpoch += 1
  activeController.abort(new DOMException('Private session changed', 'AbortError'))
  activeController = new AbortController()
  return currentEpoch
}
