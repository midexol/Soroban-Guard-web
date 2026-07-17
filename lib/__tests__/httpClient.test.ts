import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchWithRetry } from '../httpClient'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('resolves on first attempt if successful', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)

    const res = await fetchWithRetry('https://example.com')
    expect(res.ok).toBe(true)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('retries on network error up to maxAttempts', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

    await expect(
      fetchWithRetry('https://example.com', {
        retryPolicy: { maxAttempts: 3, baseDelayMs: 0 },
      })
    ).rejects.toThrow('Network error')

    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('retries on retryable status codes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 502 } as Response)

    const res = await fetchWithRetry('https://example.com', {
      retryPolicy: { maxAttempts: 3, baseDelayMs: 0, retryOnStatus: [502] },
    })

    expect(res.status).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry on non-retryable status codes', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400 } as Response)

    const res = await fetchWithRetry('https://example.com', {
      retryPolicy: { maxAttempts: 3, baseDelayMs: 0, retryOnStatus: [502] },
    })

    expect(res.status).toBe(400)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('respects abort signal and throws immediately', async () => {
    const controller = new AbortController()
    vi.mocked(fetch).mockImplementation(() => {
      controller.abort()
      const err = new DOMException('The user aborted a request.', 'AbortError')
      return Promise.reject(err)
    })

    await expect(
      fetchWithRetry('https://example.com', {
        signal: controller.signal,
        retryPolicy: { maxAttempts: 3, baseDelayMs: 0 },
      })
    ).rejects.toThrow('The user aborted a request.')

    expect(fetch).toHaveBeenCalledOnce()
  })
})
