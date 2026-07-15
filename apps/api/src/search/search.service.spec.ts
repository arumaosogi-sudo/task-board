import { FileKind } from '@prisma/client'
import { SearchService } from './search.service'

// P0 Security — cross-tenant search isolation. `search` must only ever return
// projects/files/content inside projects the caller is a member of. The guard is
// the `projectId: { in: projectIds }` filter, where projectIds is derived solely
// from the caller's own memberships. These tests prove that scoping and the
// short-circuits (blank query, no memberships) that must never touch the DB.
describe('SearchService.search — membership scoping', () => {
  let prisma: {
    membership: { findMany: jest.Mock }
    file: { findMany: jest.Mock }
  }
  let service: SearchService

  const membership = (projectId: string, name: string) => ({
    projectId,
    project: { id: projectId, name, description: `${name} desc` },
  })

  beforeEach(() => {
    prisma = { membership: { findMany: jest.fn() }, file: { findMany: jest.fn() } }
    service = new SearchService(prisma as never)
  })

  it('returns EMPTY for a too-short query without querying the DB', async () => {
    const res = await service.search('u1', 'a')
    expect(res).toEqual({ projects: [], files: [], contents: [] })
    expect(prisma.membership.findMany).not.toHaveBeenCalled()
  })

  it('returns EMPTY (and skips file queries) when the user has no memberships', async () => {
    prisma.membership.findMany.mockResolvedValue([])
    const res = await service.search('u1', 'alpha')

    expect(res).toEqual({ projects: [], files: [], contents: [] })
    expect(prisma.file.findMany).not.toHaveBeenCalled()
  })

  it('loads only memberships for the caller, excluding trashed projects', async () => {
    prisma.membership.findMany.mockResolvedValue([membership('p1', 'Alpha')])
    prisma.file.findMany.mockResolvedValue([])

    await service.search('u1', 'alpha')

    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', project: { deletedAt: null } } }),
    )
  })

  it('scopes BOTH the file-name and content queries to the caller’s project ids', async () => {
    prisma.membership.findMany.mockResolvedValue([membership('p1', 'Alpha'), membership('p2', 'Beta')])
    prisma.file.findMany.mockResolvedValue([])

    await service.search('u1', 'report')

    expect(prisma.file.findMany).toHaveBeenCalledTimes(2)
    for (const call of prisma.file.findMany.mock.calls) {
      expect(call[0].where.projectId).toEqual({ in: ['p1', 'p2'] })
      expect(call[0].where.deletedAt).toBeNull()
    }
    // The content query additionally restricts to Document-kind files.
    const contentCall = prisma.file.findMany.mock.calls.find((c) => c[0].where.kind === FileKind.Document)
    expect(contentCall).toBeDefined()
  })

  it('matches projects by name only within the caller’s memberships (no extra DB scope risk)', async () => {
    prisma.membership.findMany.mockResolvedValue([membership('p1', 'Alpha'), membership('p2', 'Beta')])
    prisma.file.findMany.mockResolvedValue([])

    const res = await service.search('u1', 'alph')

    expect(res.projects).toEqual([{ id: 'p1', name: 'Alpha', description: 'Alpha desc' }])
  })

  it('labels file hits with the project name resolved from the caller’s own memberships', async () => {
    prisma.membership.findMany.mockResolvedValue([membership('p1', 'Alpha')])
    prisma.file.findMany
      .mockResolvedValueOnce([{ id: 'f1', name: 'Notes', projectId: 'p1' }]) // files-by-name
      .mockResolvedValueOnce([]) // contents

    const res = await service.search('u1', 'notes')

    expect(res.files).toEqual([
      { fileId: 'f1', fileName: 'Notes', projectId: 'p1', projectName: 'Alpha' },
    ])
  })
})
