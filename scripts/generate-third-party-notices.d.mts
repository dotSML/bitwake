export interface ThirdPartyNoticesResult {
  count: number
  contents: string
}

export function generateThirdPartyNotices(outputPath?: string): Promise<ThirdPartyNoticesResult>
