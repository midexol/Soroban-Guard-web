import { isValidNpmPackage, buildUnpkgPackagePath, fetchNpmSource } from '../npm'

describe('isValidNpmPackage', () => {
  it('accepts simple package names', () => {
    expect(isValidNpmPackage('lodash')).toBe(true)
    expect(isValidNpmPackage('react')).toBe(true)
  })

  it('accepts scoped packages', () => {
    expect(isValidNpmPackage('@scope/pkg')).toBe(true)
    expect(isValidNpmPackage('@babel/core')).toBe(true)
  })

  it('accepts names with dots, hyphens, underscores', () => {
    expect(isValidNpmPackage('my-pkg')).toBe(true)
    expect(isValidNpmPackage('my_pkg')).toBe(true)
    expect(isValidNpmPackage('my.pkg')).toBe(true)
  })

  it('rejects empty or whitespace-only names', () => {
    expect(isValidNpmPackage('')).toBe(false)
    expect(isValidNpmPackage('   ')).toBe(false)
  })

  it('rejects names longer than 214 characters', () => {
    expect(isValidNpmPackage('a'.repeat(215))).toBe(false)
  })

  it('rejects names with uppercase letters', () => {
    expect(isValidNpmPackage('MyPackage')).toBe(false)
  })

  it('rejects names with invalid characters', () => {
    expect(isValidNpmPackage('my package')).toBe(false)
    expect(isValidNpmPackage('my!pkg')).toBe(false)
  })

  it('trims whitespace before validating', () => {
    expect(isValidNpmPackage('  lodash  ')).toBe(true)
  })
})

describe('buildUnpkgPackagePath', () => {
  it('encodes a simple package name', () => {
    expect(buildUnpkgPackagePath('lodash')).toBe('lodash')
  })

  it('encodes a scoped package', () => {
    expect(buildUnpkgPackagePath('@babel/core')).toBe('@babel/core')
  })

  it('trims whitespace', () => {
    expect(buildUnpkgPackagePath('  lodash  ')).toBe('lodash')
  })

  it('throws for invalid package names', () => {
    expect(() => buildUnpkgPackagePath('INVALID!')).toThrow('Invalid package name')
  })
})

describe('fetchNpmSource', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('throws for invalid package names', async () => {
    await expect(fetchNpmSource('INVALID!')).rejects.toThrow('Invalid package name')
  })

  it('throws when package is not found (404) and does not retry', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 })
    await expect(fetchNpmSource('no-such-pkg-xyzxyz')).rejects.toThrow('Package not found on npm')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('throws when unpkg returns a non-404 error and retries 5 times', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 })
    await expect(fetchNpmSource('lodash')).rejects.toThrow('unpkg returned 500')
    expect(global.fetch).toHaveBeenCalledTimes(5)
  })

  it('returns content on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => 'console.log("hi")',
    })
    const result = await fetchNpmSource('lodash')
    expect(result).toBe('console.log("hi")')
  })

  it('throws when content exceeds 100 000 characters', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => 'x'.repeat(100_001),
    })
    await expect(fetchNpmSource('lodash')).rejects.toThrow('File too large')
  })

  it('accepts an optional version parameter', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => '// v1',
    })
    const result = await fetchNpmSource('lodash', '4.17.21')
    expect(result).toBe('// v1')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('4.17.21')
  })
})
