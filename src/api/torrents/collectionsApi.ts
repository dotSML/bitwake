import type { HttpClient } from '@/api/core/httpClient'

export interface EditCategoryOptions {
  savePath: string
  /** The category's existing download_path value, preserved across the edit. */
  downloadPath?: string | false | null
}

export function createCollectionsApi(http: HttpClient) {
  const post = (
    route: string,
    body: Readonly<Record<string, string | number | boolean>>,
    signal?: AbortSignal
  ) =>
    http.request<void>(`torrents/${route}`, {
      method: 'POST',
      body,
      response: 'empty',
      ...(signal ? { signal } : {})
    })

  return {
    createCategory: (category: string, savePath = '', signal?: AbortSignal) =>
      post('createCategory', { category, savePath }, signal),
    editCategory: (category: string, options: EditCategoryOptions, signal?: AbortSignal) => {
      const body: Record<string, string | boolean> = {
        category,
        savePath: options.savePath
      }
      // qBittorrent reconstructs CategoryOptions in this endpoint. Omitting
      // these fields would disable a separately configured download path.
      if (options.downloadPath !== undefined) {
        body.downloadPathEnabled = typeof options.downloadPath === 'string'
        body.downloadPath = typeof options.downloadPath === 'string' ? options.downloadPath : ''
      }
      return post('editCategory', body, signal)
    },
    removeCategories: (categories: readonly string[], signal?: AbortSignal) =>
      post('removeCategories', { categories: categories.join('\n') }, signal),
    createTags: (tags: readonly string[], signal?: AbortSignal) =>
      post('createTags', { tags: tags.join(',') }, signal),
    deleteTags: (tags: readonly string[], signal?: AbortSignal) =>
      post('deleteTags', { tags: tags.join(',') }, signal)
  }
}
