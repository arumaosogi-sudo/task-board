// Jest config for @task-board/api INTEGRATION tests (real PostgreSQL).
//
// Separate from jest.config.js (unit) on purpose:
//   - Unit specs (`*.spec.ts`) mock Prisma and run with no external deps — they
//     stay in `npm test` and CI's default job.
//   - Integration specs (`*.int-spec.ts`) hit a real Postgres via TEST_DATABASE_URL
//     to catch mock/schema drift and verify DB-level RLS. They run via
//     `npm run test:int` and a dedicated CI job with a Postgres service.
//
// The `.int-spec.ts` suffix is NOT matched by the unit config's `.*\.spec\.ts$`
// (there's a `-` where that regex needs a `.` before `spec`), so the two suites
// never overlap. Run serially (`--runInBand`, passed by the npm script) because
// they share one database and TRUNCATE between tests.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.int-spec\\.ts$',
  // reflect-metadata + the TEST_DATABASE_URL safety guards.
  setupFiles: ['<rootDir>/testing/int/env-setup.ts'],
  // Create roles + `prisma migrate deploy` once before the whole suite.
  globalSetup: '<rootDir>/testing/int/global-setup.ts',
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2021',
          keepClassNames: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@task-board/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  clearMocks: true,
  // A real DB connection can outlive the test; give teardown room and surface leaks.
  testTimeout: 30000,
}
