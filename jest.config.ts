import type { Config } from 'jest';

const config: Config = {
  // preset: 'ts-jest',
  transform: { '\\.ts$': 'esbuild-runner/jest' },
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  setupFilesAfterEnv: ['<rootDir>/src/jest_setup.ts'],
  modulePaths: ['<rootDir>/src'],
};

module.exports = config;
