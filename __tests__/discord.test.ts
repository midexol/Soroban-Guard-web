import { postToDiscord } from '@/lib/discord'
import type { Finding } from '@/types/findings'

const mockFinding: Finding = {
  check_name: 'unchecked-auth',
  severity: 'Critical',
  file_path: 'src/lib.rs',
  line: 42,
  function_name: 'transfer',
  description: 'Authorization is not verified before executing privileged operation.',
}

const lowFinding: Finding = {
  check_name: 'unused-var',
  severity: 'Low',
  file_path: 'src/lib.rs',
  line: 10,
  function_name: 'init',
  description: 'Unused variable.',
}

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('postToDiscord', () => {
  it('does nothing when webhookUrl is empty', async () => {
    await postToDiscord('   ', [mockFinding], 'src/lib.rs')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('posts embed with correct severity counts', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true } as Response)
    await postToDiscord('https://discord.com/api/webhooks/test', [mockFinding], 'src/lib.rs')
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://discord.com/api/webhooks/test')
    const body = JSON.parse((init as RequestInit).body as string)
    const embed = body.embeds[0]
    expect(embed.title).toBe('Soroban Guard scan complete')
    const totalField = embed.fields.find((f: { name: string }) => f.name === 'Total')
    expect(totalField.value).toBe('1')
    const criticalField = embed.fields.find((f: { name: string }) => f.name === 'Critical')
    expect(criticalField.value).toBe('1')
  })

  it('uses red color for critical findings', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true } as Response)
    await postToDiscord('https://discord.com/api/webhooks/test', [mockFinding], 'src/lib.rs')
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.embeds[0].color).toBe(0xdc2626)
  })

  it('uses green color when no high/critical findings', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true } as Response)
    await postToDiscord('https://discord.com/api/webhooks/test', [lowFinding], 'src/lib.rs')
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.embeds[0].color).toBe(0x22c55e)
  })

  it('truncates long source labels', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true } as Response)
    const longSource = 'a'.repeat(200)
    await postToDiscord('https://discord.com/api/webhooks/test', [], longSource)
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.embeds[0].description).toContain('...')
    expect(body.embeds[0].description.length).toBeLessThan(200)
  })

  it('swallows fetch errors silently', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))
    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', [mockFinding], 'src/lib.rs'),
    ).resolves.toBeUndefined()
  })

  it('swallows non-ok responses silently', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 400 } as Response)
    await expect(
      postToDiscord('https://discord.com/api/webhooks/test', [mockFinding], 'src/lib.rs'),
    ).resolves.toBeUndefined()
  })

  it('includes top finding field sorted by severity', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true } as Response)
    await postToDiscord('https://discord.com/api/webhooks/test', [lowFinding, mockFinding], 'src')
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    const topField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Top finding')
    expect(topField.value).toContain('Critical')
    expect(topField.value).toContain('unchecked-auth')
  })
})
