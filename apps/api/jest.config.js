// Jest config for @task-board/api (NestJS).
//
// Runner: Jest + @swc/jest — SWC transpiles TS ~20x faster than ts-jest and,
// critically, emits the `emitDecoratorMetadata` reflection data that Nest's DI
// container relies on (legacyDecorator + decoratorMetadata below). Type errors
// are caught separately by `npm run typecheck` (tsc --noEmit), so the runner
// intentionally does no type-checking.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
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
  // Mirror the tsconfig path alias so unit tests can import shared types.
  moduleNameMapper: {
    '^@task-board/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  clearMocks: true,
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.ts', '!**/main.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
}
