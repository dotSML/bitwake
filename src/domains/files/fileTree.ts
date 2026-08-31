import type { TorrentFile } from '@/api/types/models'

export interface FileTreeNode {
  id: string
  name: string
  path: string
  depth: number
  kind: 'folder' | 'file'
  size: number
  completed: number
  priority: number | null
  fileIndex: number | null
  children: FileTreeNode[]
  descendantIndexes: number[]
}

function folderNode(name: string, path: string, depth: number): FileTreeNode {
  return {
    id: `folder:${path}`,
    name,
    path,
    depth,
    kind: 'folder',
    size: 0,
    completed: 0,
    priority: null,
    fileIndex: null,
    children: [],
    descendantIndexes: []
  }
}

export function buildFileTree(files: readonly TorrentFile[]): FileTreeNode[] {
  const root = folderNode('', '', -1)
  const folders = new Map<string, FileTreeNode>([['', root]])

  for (const file of files) {
    const segments = file.name.split('/').filter(Boolean)
    if (!segments.length) continue
    let parent = root
    let parentPath = ''
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index]
      if (!segment) continue
      const path = parentPath ? `${parentPath}/${segment}` : segment
      let folder = folders.get(path)
      if (!folder) {
        folder = folderNode(segment, path, index)
        folders.set(path, folder)
        parent.children.push(folder)
      }
      parent = folder
      parentPath = path
    }
    const name = segments.at(-1) ?? file.name
    const node: FileTreeNode = {
      id: `file:${file.index}`,
      name,
      path: file.name,
      depth: segments.length - 1,
      kind: 'file',
      size: file.size,
      completed: file.size * file.progress,
      priority: file.priority,
      fileIndex: file.index,
      children: [],
      descendantIndexes: [file.index]
    }
    parent.children.push(node)
  }

  function aggregate(node: FileTreeNode): void {
    if (node.kind === 'file') return
    for (const child of node.children) aggregate(child)
    node.size = node.children.reduce((sum, child) => sum + child.size, 0)
    node.completed = node.children.reduce((sum, child) => sum + child.completed, 0)
    node.descendantIndexes = node.children.flatMap((child) => child.descendantIndexes)
    const priorities = new Set(node.children.map((child) => child.priority))
    node.priority = priorities.size === 1 ? (node.children[0]?.priority ?? null) : null
    node.children.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    })
  }
  aggregate(root)
  return root.children
}

export function flattenFileTree(
  roots: readonly FileTreeNode[],
  expanded: ReadonlySet<string>,
  search = ''
): FileTreeNode[] {
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const result: FileTreeNode[] = []

  function visit(node: FileTreeNode): boolean {
    const start = result.length
    const selfMatches =
      !normalizedSearch || node.path.toLocaleLowerCase().includes(normalizedSearch)
    if (!normalizedSearch || selfMatches || node.kind === 'folder') result.push(node)
    let descendantMatches = false
    if (node.kind === 'folder' && (expanded.has(node.id) || normalizedSearch)) {
      for (const child of node.children) descendantMatches = visit(child) || descendantMatches
    }
    const matches = selfMatches || descendantMatches
    if (normalizedSearch && !matches) result.splice(start)
    return matches
  }
  for (const root of roots) visit(root)
  return result
}
