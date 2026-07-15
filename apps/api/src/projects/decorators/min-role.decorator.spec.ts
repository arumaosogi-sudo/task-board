import { ROLE_RANK } from './min-role.decorator'

// Smoke test #2 (API): the role-privilege ordering that ProjectRoleGuard uses to
// enforce @MinRole. `Role` is a compile-time type here, so this test needs no
// generated Prisma client at runtime — the ranks are a plain object literal.
// If this invariant ever breaks, every authorization check in the app is wrong.
describe('ROLE_RANK (project role hierarchy)', () => {
  it('orders privilege strictly: Owner > Editor > Viewer', () => {
    expect(ROLE_RANK.Owner).toBeGreaterThan(ROLE_RANK.Editor)
    expect(ROLE_RANK.Editor).toBeGreaterThan(ROLE_RANK.Viewer)
  })

  it('assigns the exact ranks the guard comparisons assume', () => {
    expect(ROLE_RANK).toEqual({ Viewer: 0, Editor: 1, Owner: 2 })
  })

  it('lets a higher role satisfy a lower @MinRole requirement (guard semantics)', () => {
    // guard rule: allow when ROLE_RANK[membership] >= ROLE_RANK[required]
    const satisfies = (membership: keyof typeof ROLE_RANK, required: keyof typeof ROLE_RANK) =>
      ROLE_RANK[membership] >= ROLE_RANK[required]

    expect(satisfies('Owner', 'Viewer')).toBe(true)
    expect(satisfies('Editor', 'Editor')).toBe(true)
    expect(satisfies('Viewer', 'Editor')).toBe(false)
    expect(satisfies('Viewer', 'Owner')).toBe(false)
  })
})
