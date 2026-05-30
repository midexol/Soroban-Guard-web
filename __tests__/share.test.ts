import {
  encodeFindings,
  decodeFindings,
  encodeWorkspace,
  decodeWorkspace,
} from '@/lib/share'
import type { Finding } from '@/types/findings'

const finding: Finding = {
  check_name: 'unchecked-auth',
  severity: 'High',
  file_path: 'src/lib.rs',
  line: 42,
  function_name: 'transfer',
  description: 'Authorization not verified.',
}

describe('encodeFindings / decodeFindings', () => {
  it('round-trips a non-empty findings array', () => {
    const encoded = encodeFindings([finding])
    const decoded = decodeFindings(encoded)
    expect(decoded).toEqual([finding])
  })

  it('round-trips an empty array', () => {
    const encoded = encodeFindings([])
    const decoded = decodeFindings(encoded)
    expect(decoded).toEqual([])
  })

  it('round-trips multiple findings', () => {
    const findings: Finding[] = [
      finding,
      { ...finding, severity: 'Low', check_name: 'other', line: 10 },
    ]
    expect(decodeFindings(encodeFindings(findings))).toEqual(findings)
  })

  it('returns [] for invalid input', () => {
    expect(decodeFindings('not-valid-base64!!!')).toEqual([])
  })

  it('returns [] for empty string', () => {
    expect(decodeFindings('')).toEqual([])
  })
})

describe('encodeWorkspace / decodeWorkspace', () => {
  it('round-trips source and findings', () => {
    const encoded = encodeWorkspace('my-source', [finding])
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual({ source: 'my-source', findings: [finding] })
  })

  it('round-trips with empty findings', () => {
    const encoded = encodeWorkspace('src', [])
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual({ source: 'src', findings: [] })
  })

  it('round-trips with empty source', () => {
    const encoded = encodeWorkspace('', [finding])
    const decoded = decodeWorkspace(encoded)
    expect(decoded).toEqual({ source: '', findings: [finding] })
  })

  it('returns null for invalid input', () => {
    expect(decodeWorkspace('garbage!!!')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(decodeWorkspace('')).toBeNull()
  })
})
