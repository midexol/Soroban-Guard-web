import { describe, it, expect, vi, beforeEach } from 'vitest'
import { postToSlack, countBySeverity } from '../slack'
import type { Finding } from '@/types/findings'

const makeFindings = (...severities: Array<Finding['severity']>): Finding[] =>
  severities.map((severity, i) => ({
    check_name: `check-${i}`,
    severity,
    file_path: 'src/lib.rs',
    line: i + 1,
    function_name: `fn_${i}`,
    description: `Description ${i}`,
  }))

describe('countBySeverity', () => {
  it('counts each severity correctly', () => {
    const findings = makeFindings('Critical', 'High', 'High', 'Medium', 'Low', 'Info')
    const counts = countBySeverity(findings)
    expect(counts).toEqual({ Critical: 1, High: 2, Medium: 1, Low: 1, Info: 1 })
  })

  it('returns all-zero counts for empty array', () => {
    const counts = countBySeverity([])
    expect(counts).toEqual({ Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 })
  })
})

describe('postToSlack', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('window', {
      sessionStorage: { getItem: () => null },
      location: { href: 'http://localhost/' },
    })
  })

  it('does nothing when webhookUrl is blank', async () => {
    await postToSlack('   ', makeFindings('High'), 'src/lib.rs')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('posts JSON blocks to the webhook URL', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    await postToSlack('https://hooks.slack.com/T0/B0/xyz', makeFindings('High', 'Medium'), 'my-contract.rs')

    expect(vi.mocked(fetch)).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://hooks.slack.com/T0/B0/xyz')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body.blocks).toBeDefined()
    expect(body.blocks[0].text.text).toContain('Soroban Guard scan complete')
    expect(body.blocks[0].text.text).toContain('my-contract.rs')
  })

  it('includes severity counts in the message blocks', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    await postToSlack('https://hooks.slack.com/T0/B0/xyz', makeFindings('Critical', 'High', 'Medium'), 'src.rs')

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    const fields = body.blocks[1].fields as Array<{ text: string }>
    expect(fields.find((f) => f.text.includes('*Critical*'))?.text).toContain('1')
    expect(fields.find((f) => f.text.includes('*High*'))?.text).toContain('1')
    expect(fields.find((f) => f.text.includes('*Total*'))?.text).toContain('3')
  })

  it('truncates source label longer than 120 characters', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    const longSource = 'a'.repeat(130)

    await postToSlack('https://hooks.slack.com/T0/B0/xyz', makeFindings('Low'), longSource)

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    const headerText = body.blocks[0].text.text as string
    expect(headerText).toContain('...')
    expect(headerText).not.toContain('a'.repeat(130))
  })

  it('does not throw when fetch fails and retries 3 times', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'))

    await expect(
      postToSlack('https://hooks.slack.com/T0/B0/xyz', makeFindings('High'), 'src.rs'),
    ).resolves.toBeUndefined()

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3)
  })
})
