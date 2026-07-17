import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createJiraIssue, normalizeBaseUrl, toJiraDoc } from '../jira'
import type { Finding } from '@/types/findings'

const mockFinding: Finding = {
  check_name: 'unchecked-auth',
  severity: 'High',
  file_path: 'src/lib.rs',
  line: 42,
  function_name: 'transfer',
  description: 'Authorization is not verified before executing privileged operation.',
  remediation: 'Add require_auth() call before the privileged operation.',
}

describe('normalizeBaseUrl', () => {
  it('strips trailing slashes', () => {
    expect(normalizeBaseUrl('https://example.atlassian.net/')).toBe('https://example.atlassian.net')
    expect(normalizeBaseUrl('https://example.atlassian.net///')).toBe('https://example.atlassian.net')
  })

  it('leaves URL without trailing slash unchanged', () => {
    expect(normalizeBaseUrl('https://example.atlassian.net')).toBe('https://example.atlassian.net')
  })
})

describe('toJiraDoc', () => {
  it('wraps each line in a paragraph node', () => {
    const doc = toJiraDoc('line one\nline two')
    expect(doc.type).toBe('doc')
    expect(doc.version).toBe(1)
    expect(doc.content).toHaveLength(2)
    expect(doc.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'line one' }] })
    expect(doc.content[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'line two' }] })
  })

  it('produces empty content array for empty lines', () => {
    const doc = toJiraDoc('')
    expect(doc.content[0]).toEqual({ type: 'paragraph', content: [] })
  })
})

describe('createJiraIssue', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('btoa', (str: string) => Buffer.from(str).toString('base64'))
  })

  it('returns browse URL when response has a key', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'PROJ-123', self: 'https://example.atlassian.net/rest/api/3/issue/123' }),
      text: async () => '',
    } as Response)

    const url = await createJiraIssue(
      'https://example.atlassian.net',
      'user@example.com',
      'token123',
      'PROJ',
      mockFinding,
    )

    expect(url).toBe('https://example.atlassian.net/browse/PROJ-123')
  })

  it('returns self URL when response has no key', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ self: 'https://example.atlassian.net/rest/api/3/issue/456' }),
      text: async () => '',
    } as Response)

    const url = await createJiraIssue(
      'https://example.atlassian.net',
      'user@example.com',
      'token123',
      'PROJ',
      mockFinding,
    )

    expect(url).toBe('https://example.atlassian.net/rest/api/3/issue/456')
  })

  it('normalizes trailing slash in base URL', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'PROJ-1' }),
      text: async () => '',
    } as Response)

    const url = await createJiraIssue(
      'https://example.atlassian.net/',
      'user@example.com',
      'token123',
      'PROJ',
      mockFinding,
    )

    expect(url).toBe('https://example.atlassian.net/browse/PROJ-1')
    const [fetchUrl] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]
    expect(fetchUrl).toBe('https://example.atlassian.net/rest/api/3/issue')
  })

  it('does not retry on 403 status code', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    } as Response)

    await expect(
      createJiraIssue('https://example.atlassian.net', 'user@example.com', 'token', 'PROJ', mockFinding),
    ).rejects.toThrow('Forbidden')

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce()
  })

  it('retries on 500 status code up to 3 times', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response)

    await expect(
      createJiraIssue('https://example.atlassian.net', 'user@example.com', 'token', 'PROJ', mockFinding),
    ).rejects.toThrow('Internal Server Error')

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
  })

  it('includes remediation in the issue body when present', async () => {
    let capturedBody: string | undefined
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedBody = init?.body as string
      return { ok: true, json: async () => ({ key: 'PROJ-1' }), text: async () => '' } as Response
    })

    await createJiraIssue('https://example.atlassian.net', 'u@e.com', 'tok', 'PROJ', mockFinding)

    expect(capturedBody).toContain('Remediation')
    expect(capturedBody).toContain('Add require_auth()')
  })
})
