import { Injectable } from '@nestjs/common'
import { FileKind } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface SearchProjectHit {
  id: string
  name: string
  description: string
}
export interface SearchFileHit {
  fileId: string
  fileName: string
  projectId: string
  projectName: string
}
export interface SearchContentHit extends SearchFileHit {
  snippet: string
}
export interface SearchResults {
  projects: SearchProjectHit[]
  files: SearchFileHit[]
  contents: SearchContentHit[]
}

const EMPTY: SearchResults = { projects: [], files: [], contents: [] }
const PER_GROUP = 8

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full-text-ish search across the projects a user belongs to. Results are
   * strictly scoped to the caller's memberships so the endpoint can never leak
   * another team's project/file/content. Content match uses a case-insensitive
   * LIKE — adequate at current scale; a Postgres FTS index (tsvector) is the
   * upgrade path if the documents table grows large.
   */
  async search(userId: string, rawQuery: string): Promise<SearchResults> {
    const q = rawQuery.trim()
    if (q.length < 2) return EMPTY

    // The set of projects the caller may see (member + not trashed).
    const memberships = await this.prisma.membership.findMany({
      where: { userId, project: { deletedAt: null } },
      select: { projectId: true, project: { select: { id: true, name: true, description: true } } },
    })
    if (memberships.length === 0) return EMPTY

    const projectIds = memberships.map((m) => m.projectId)
    const projectNameById = new Map(memberships.map((m) => [m.projectId, m.project.name]))

    const [projects, files, contents] = await Promise.all([
      // Projects by name (from the memberships we already loaded — no extra scope risk).
      Promise.resolve(
        memberships
          .filter((m) => m.project.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, PER_GROUP)
          .map((m) => ({ id: m.project.id, name: m.project.name, description: m.project.description })),
      ),
      // Files by name.
      this.prisma.file.findMany({
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          name: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, name: true, projectId: true },
        take: PER_GROUP,
        orderBy: { updatedAt: 'desc' },
      }),
      // Documents by body content.
      this.prisma.file.findMany({
        where: {
          projectId: { in: projectIds },
          deletedAt: null,
          kind: FileKind.Document,
          content: { contains: q, mode: 'insensitive' },
        },
        select: { id: true, name: true, projectId: true, content: true },
        take: PER_GROUP,
        orderBy: { updatedAt: 'desc' },
      }),
    ])

    return {
      projects,
      files: files.map((f) => ({
        fileId: f.id,
        fileName: f.name,
        projectId: f.projectId,
        projectName: projectNameById.get(f.projectId) ?? '',
      })),
      contents: contents.map((f) => ({
        fileId: f.id,
        fileName: f.name,
        projectId: f.projectId,
        projectName: projectNameById.get(f.projectId) ?? '',
        snippet: this.makeSnippet(f.content ?? '', q),
      })),
    }
  }

  /** Extract a plaintext excerpt around the first match, stripping HTML tags. */
  private makeSnippet(html: string, q: string): string {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return text.slice(0, 120)
    const start = Math.max(0, idx - 40)
    const end = Math.min(text.length, idx + q.length + 60)
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
  }
}
