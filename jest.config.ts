import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/app/api/',
    '/__tests__/telegram',
    '/__tests__/githubExport',
    '/__tests__/ipfs',
    '/__tests__/gist',
    '/lib/stellar\\.test\\.ts',
    '/lib/attestation\\.test\\.ts',
    '/lib/diffFindings\\.test\\.ts',
    '/lib/score\\.test\\.ts',
    '/lib/__tests__/analytics',
    '/lib/__tests__/clawbackNormalizer',
    '/lib/__tests__/groupFindings',
    '/lib/__tests__/jira',
    '/lib/__tests__/slack',
    '/lib/__tests__/wallet',
    '/lib/__tests__/schedule',
    '/lib/__tests__/httpClient',
    '/components/WalletConnect\\.test\\.tsx',
  ],
  transform: {
    '^.+\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', rootDir: '.' } }],
  },
}

export default config
