// Pure helpers over the project file tree. Kept out of WorkPage so the traversal
// logic is unit-testable without mounting the page (same split as lib/htmlDiff).
import type { FileNode } from './files'

/**
 * Every folder in the tree as a flat list with its full path as the label, so the
 * "Move to" picker reads unambiguously when two folders share a name.
 */
export function folderPaths(nodes: FileNode[], prefix = ''): { id: string; label: string }[] {
  return nodes.flatMap((n) => {
    if (n.kind !== 'Folder') return []
    const label = prefix ? `${prefix} / ${n.name}` : n.name
    return [{ id: n.id, label }, ...folderPaths(n.children, label)]
  })
}

/**
 * Ids of `node` and everything under it — never valid move targets, since moving a
 * folder into its own subtree would detach that subtree from the root. The server
 * rejects it too (files.service `assertNotDescendant`); this keeps the picker honest
 * so the user is never offered a choice that can only fail.
 */
export function subtreeIds(node: FileNode): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)]
}
