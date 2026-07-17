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
  // Load the reflect-metadata polyfill once before any spec. Specs that import
  // Nest-decorated classes (@Injectable/@Controller) trigger swc-emitted
  // Reflect.metadata() calls at class-definition time, which need this global.
  setupFiles: ['reflect-metadata'],
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
  // `sanitize-html` (used by the share module) pulls a few ESM-only deps that ship
  // untranspiled `import` syntax. By default Jest skips node_modules, so let @swc/jest
  // transpile just this subtree to CJS. Everything else stays ignored (fast).
  transformIgnorePatterns: [
    '/node_modules/(?!(sanitize-html|htmlparser2|domhandler|domutils|dom-serializer|domelementtype|entities|css-select|css-what|boolbase|nth-check)/)',
  ],
  // Mirror the tsconfig path alias so unit tests can import shared types.
  moduleNameMapper: {
    '^@task-board/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  clearMocks: true,
  collectCoverageFrom: ['**/*.(t|j)s', '!**/*.spec.ts', '!**/main.ts', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
}
