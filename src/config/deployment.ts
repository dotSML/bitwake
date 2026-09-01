export const deploymentModes = [
  'alternative-public',
  'alternative-private',
  'standalone',
  'mock'
] as const

export type DeploymentMode = (typeof deploymentModes)[number]

export const deploymentMode: DeploymentMode = __DEPLOYMENT_MODE__
export const mockBackendEnabled = __MOCK_BACKEND__

export function usesNativeAuthenticationBoundary(mode: DeploymentMode = deploymentMode): boolean {
  return mode === 'alternative-public' || mode === 'alternative-private'
}
