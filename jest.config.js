/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },
  // Jest 30's multi-worker pool intermittently reports "a worker process has
  // failed to exit gracefully" in this environment. It reproduces with suites
  // containing nothing but `expect(1).toBe(1)`, and --detectOpenHandles finds
  // nothing, so it is a pool-teardown issue rather than a leak in these tests.
  // The suite runs in ~5s either way, so a single worker costs nothing.
  maxWorkers: 1,
  collectCoverageFrom: ['src/**/*.ts'],
  clearMocks: true,
  restoreMocks: true
};
