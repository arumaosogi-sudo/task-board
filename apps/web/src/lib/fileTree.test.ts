import { describe, it, expect } from 'vitest'
import { folderPaths, subtreeIds } from './fileTree'
import type { FileNode } from './files'

/** Minimal FileNode factory — the helpers only read id/name/kind/children. */
function node(id: string, kind: 'Folder' | 'Document', name: string, children: FileNode[] = []): FileNode {
  return {
    id,
    name,
    kind,
    orientation: null,
    parentId: null,
    order: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    children,
  }
}

const tree: FileNode[] = [
  node('f1', 'Folder', 'Reports', [
    node('f2', 'Folder', 'Q1', [node('d1', 'Document', 'Summary')]),
    node('d2', 'Document', 'Draft'),
  ]),
  node('f3', 'Folder', 'Archive', [node('f4', 'Folder', 'Q1')]),
  node('d3', 'Document', 'Loose note'),
]

describe('folderPaths', () => {
  it('lists folders only, never documents', () => {
    expect(folderPaths(tree).map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4'])
  })

  it('labels nested folders with their full path', () => {
    const byId = Object.fromEntries(folderPaths(tree).map((f) => [f.id, f.label]))
    expect(byId.f1).toBe('Reports')
    expect(byId.f2).toBe('Reports / Q1')
    expect(byId.f4).toBe('Archive / Q1')
  })

  it('disambiguates same-named folders under different parents', () => {
    const labels = folderPaths(tree).map((f) => f.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('returns an empty list for a flat, document-only project', () => {
    expect(folderPaths([node('d9', 'Document', 'Only doc')])).toEqual([])
  })

  it('handles an empty tree', () => {
    expect(folderPaths([])).toEqual([])
  })
})

describe('subtreeIds', () => {
  it('includes the node itself', () => {
    expect(subtreeIds(tree[2])).toEqual(['d3'])
  })

  it('collects every descendant depth-first', () => {
    expect(subtreeIds(tree[0])).toEqual(['f1', 'f2', 'd1', 'd2'])
  })

  it('excludes the whole subtree from the move targets offered for that node', () => {
    const blocked = new Set(subtreeIds(tree[0]))
    const offered = folderPaths(tree).filter((f) => !blocked.has(f.id)).map((f) => f.id)
    // f1 (itself) and f2 (its child) must not be offered; sibling folders still are.
    expect(offered).toEqual(['f3', 'f4'])
  })
})
