/**
 * @jest-environment jsdom
 */
import { exportMarkdown, exportEmail, exportJson, exportCsv, exportXml } from '@/lib/export'
import type { Finding } from '@/types/findings'

const finding: Finding = {
  check_name: 'unchecked-auth',
  severity: 'High',
  file_path: 'src/lib.rs',
  line: 42,
  function_name: 'transfer',
  description: 'Authorization not verified.',
  remediation: 'Add auth check.',
}

const findingWithSpecialChars: Finding = {
  check_name: 'xml-injection',
  severity: 'Critical',
  file_path: 'src/a&b.rs',
  line: 1,
  function_name: 'foo<bar>',
  description: 'Desc with "quotes" & <tags>.',
}

// --- exportMarkdown ---

describe('exportMarkdown', () => {
  const meta = { source: 'my-contract', scannedAt: '2024-01-01' }

  it('returns a string starting with the report header', () => {
    const result = exportMarkdown([finding], meta)
    expect(result).toContain('# Soroban Guard Security Report')
  })

  it('includes source and scannedAt metadata', () => {
    const result = exportMarkdown([finding], meta)
    expect(result).toContain('**Source:** my-contract')
    expect(result).toContain('**Scanned at:** 2024-01-01')
  })

  it('includes finding details', () => {
    const result = exportMarkdown([finding], meta)
    expect(result).toContain('[High] unchecked-auth')
    expect(result).toContain('`transfer`')
    expect(result).toContain('`src/lib.rs`')
    expect(result).toContain('line 42')
    expect(result).toContain('Authorization not verified.')
    expect(result).toContain('Add auth check.')
  })

  it('shows correct severity count in summary', () => {
    const result = exportMarkdown([finding], meta)
    expect(result).toContain('| High     | 1 |')
    expect(result).toContain('| **Total**| **1** |')
  })

  it('handles empty findings', () => {
    const result = exportMarkdown([], meta)
    expect(result).toContain('No vulnerabilities found.')
    expect(result).toContain('| **Total**| **0** |')
  })

  it('omits remediation line when not present', () => {
    const f: Finding = { ...finding, remediation: undefined }
    const result = exportMarkdown([f], meta)
    expect(result).not.toContain('**Remediation:**')
  })
})

// --- exportEmail ---

describe('exportEmail', () => {
  it('returns a mailto URI', () => {
    const result = exportEmail([finding])
    expect(result).toMatch(/^mailto:/)
    expect(result).toContain('subject=')
    expect(result).toContain('body=')
  })

  it('encodes finding details in the body', () => {
    const result = exportEmail([finding])
    const body = decodeURIComponent(result.split('body=')[1])
    expect(body).toContain('[High] unchecked-auth')
    expect(body).toContain('transfer')
    expect(body).toContain('src/lib.rs')
  })

  it('handles empty findings', () => {
    const result = exportEmail([])
    const body = decodeURIComponent(result.split('body=')[1])
    expect(body).toBe('No vulnerabilities found.')
  })

  it('numbers multiple findings', () => {
    const result = exportEmail([finding, finding])
    const body = decodeURIComponent(result.split('body=')[1])
    expect(body).toContain('1.')
    expect(body).toContain('2.')
  })
})

// --- DOM-dependent functions (exportJson, exportCsv, exportXml) ---

const mockClick = jest.fn()
const mockAppendChild = jest.fn()
const mockRemove = jest.fn()
const mockRevokeObjectURL = jest.fn()
const mockCreateObjectURL = jest.fn(() => 'blob:mock')

let capturedBlob: Blob | null = null

beforeEach(() => {
  jest.clearAllMocks()
  capturedBlob = null

  global.URL.createObjectURL = mockCreateObjectURL
  global.URL.revokeObjectURL = mockRevokeObjectURL

  global.Blob = class MockBlob {
    content: string[]
    type: string
    constructor(parts: string[], opts?: { type?: string }) {
      this.content = parts
      this.type = opts?.type ?? ''
      capturedBlob = this as unknown as Blob
    }
    text() { return Promise.resolve(this.content.join('')) }
  } as unknown as typeof Blob

  const mockAnchor = { href: '', download: '', click: mockClick, remove: mockRemove }
  jest.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLElement)
  jest.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('exportJson', () => {
  it('creates a JSON blob and triggers download', () => {
    exportJson([finding])
    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
    expect(mockClick).toHaveBeenCalledTimes(1)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('creates an empty blob for empty findings', () => {
    exportJson([])
    const blob = capturedBlob as unknown as { content: string[] }
    expect(blob.content[0]).toBe('')
  })

  it('serializes findings as JSON', () => {
    exportJson([finding])
    const blob = capturedBlob as unknown as { content: string[] }
    const parsed = JSON.parse(blob.content[0])
    expect(parsed[0].check_name).toBe('unchecked-auth')
  })
})

describe('exportCsv', () => {
  it('triggers download with CSV content', () => {
    exportCsv([finding])
    expect(mockClick).toHaveBeenCalledTimes(1)
  })

  it('includes CSV headers', () => {
    exportCsv([finding])
    const blob = capturedBlob as unknown as { content: string[] }
    expect(blob.content[0]).toContain('severity,check_name,function_name,file_path,line,description')
  })

  it('includes finding data row', () => {
    exportCsv([finding])
    const blob = capturedBlob as unknown as { content: string[] }
    expect(blob.content[0]).toContain('High,unchecked-auth,transfer,src/lib.rs,42')
  })

  it('downloads headers-only for empty findings', () => {
    exportCsv([])
    const blob = capturedBlob as unknown as { content: string[] }
    expect(blob.content[0]).toBe('severity,check_name,function_name,file_path,line,description')
  })

  it('quotes fields containing commas', () => {
    const f: Finding = { ...finding, description: 'a, b, c' }
    exportCsv([f])
    const blob = capturedBlob as unknown as { content: string[] }
    expect(blob.content[0]).toContain('"a, b, c"')
  })
})

describe('exportXml', () => {
  it('triggers download', () => {
    exportXml([finding])
    expect(mockClick).toHaveBeenCalledTimes(1)
  })

  it('produces valid XML structure', () => {
    exportXml([finding])
    const blob = capturedBlob as unknown as { content: string[] }
    const xml = blob.content[0]
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<scanReport>')
    expect(xml).toContain('<findings>')
    expect(xml).toContain('</scanReport>')
  })

  it('includes finding fields', () => {
    exportXml([finding])
    const blob = capturedBlob as unknown as { content: string[] }
    const xml = blob.content[0]
    expect(xml).toContain('<severity>High</severity>')
    expect(xml).toContain('<checkName>unchecked-auth</checkName>')
    expect(xml).toContain('<line>42</line>')
  })

  it('escapes XML special characters', () => {
    exportXml([findingWithSpecialChars])
    const blob = capturedBlob as unknown as { content: string[] }
    const xml = blob.content[0]
    expect(xml).toContain('&amp;')
    expect(xml).toContain('&lt;')
    expect(xml).toContain('&gt;')
    expect(xml).toContain('&quot;')
  })

  it('shows no-vulnerability message for empty findings', () => {
    exportXml([])
    const blob = capturedBlob as unknown as { content: string[] }
    expect(blob.content[0]).toContain('No vulnerabilities detected')
  })
})
