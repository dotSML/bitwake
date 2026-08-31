import type { HttpClient } from '@/api/core/httpClient'

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
    removeCategories: (categories: readonly string[], signal?: AbortSignal) =>
      post('removeCategories', { categories: categories.join('\n') }, signal),
    createTags: (tags: readonly string[], signal?: AbortSignal) =>
      post('createTags', { tags: tags.join(',') }, signal),
    deleteTags: (tags: readonly string[], signal?: AbortSignal) =>
      post('deleteTags', { tags: tags.join(',') }, signal)
  }
}
