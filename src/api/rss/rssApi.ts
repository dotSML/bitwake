import type { HttpClient } from '@/api/core/httpClient'

export interface RssArticle {
  id?: string
  title: string
  date?: string
  description?: string
  torrentURL?: string
  isRead?: boolean
  [key: string]: unknown
}

export interface RssFeedNode {
  uid?: string
  url?: string
  title?: string
  articles?: RssArticle[]
  lastBuildDate?: string
  isLoading?: boolean
  hasError?: boolean
  [key: string]: unknown
}

export interface RssItems {
  [key: string]: RssFeedNode | RssItems
}
export type RssRules = Record<string, Record<string, unknown>>

export function createRssApi(http: HttpClient) {
  const post = (
    route: string,
    body: Readonly<Record<string, string | number | boolean>>,
    signal?: AbortSignal
  ) =>
    http.request<void>(`rss/${route}`, {
      method: 'POST',
      body,
      response: 'empty',
      ...(signal ? { signal } : {})
    })

  return {
    items: (withData = true, signal?: AbortSignal) =>
      http.request<RssItems>('rss/items', {
        query: { withData },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    addFolder: (path: string, signal?: AbortSignal) => post('addFolder', { path }, signal),
    addFeed: (url: string, path = '', signal?: AbortSignal) =>
      post('addFeed', { url, path }, signal),
    setFeedUrl: (path: string, url: string, signal?: AbortSignal) =>
      post('setFeedURL', { path, url }, signal),
    setFeedRefreshInterval: (path: string, refreshInterval: number, signal?: AbortSignal) =>
      http.request<void>('rss/setFeedRefreshInterval', {
        method: 'POST',
        body: { path, refreshInterval },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    removeItem: (path: string, signal?: AbortSignal) => post('removeItem', { path }, signal),
    moveItem: (itemPath: string, destPath: string, signal?: AbortSignal) =>
      post('moveItem', { itemPath, destPath }, signal),
    refreshItem: (itemPath: string, signal?: AbortSignal) =>
      post('refreshItem', { itemPath }, signal),
    markAsRead: (itemPath: string, articleId?: string, signal?: AbortSignal) =>
      post('markAsRead', { itemPath, ...(articleId ? { articleId } : {}) }, signal),
    rules: (signal?: AbortSignal) =>
      http.request<RssRules>('rss/rules', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    ruleMatchingArticles: (ruleName: string, signal?: AbortSignal) =>
      http.request<Record<string, string[]>>('rss/matchingArticles', {
        query: { ruleName },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    setRule: (ruleName: string, ruleDef: Record<string, unknown>, signal?: AbortSignal) =>
      post('setRule', { ruleName, ruleDef: JSON.stringify(ruleDef) }, signal),
    renameRule: (ruleName: string, newRuleName: string, signal?: AbortSignal) =>
      post('renameRule', { ruleName, newRuleName }, signal),
    removeRule: (ruleName: string, signal?: AbortSignal) => post('removeRule', { ruleName }, signal)
  }
}
