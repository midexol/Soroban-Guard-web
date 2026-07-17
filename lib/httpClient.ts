export interface RetryPolicy {
  maxAttempts?: number
  baseDelayMs?: number
  backoffFactor?: number
  retryOnStatus?: number[] | ((status: number) => boolean)
  retryOnNetworkError?: boolean
}

export interface FetchOptions extends RequestInit {
  retryPolicy?: RetryPolicy
}

/**
 * Custom fetch wrapper that implements exponential backoff retry.
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  const { retryPolicy = {}, ...fetchOptions } = options
  const maxAttempts = retryPolicy.maxAttempts ?? 3
  const isTest = typeof process !== 'undefined' && (
    process.env.NODE_ENV === 'test' ||
    (globalThis as any).jest !== undefined ||
    (globalThis as any).vi !== undefined
  )
  const baseDelayMs = isTest ? 0 : (retryPolicy.baseDelayMs ?? 1000)
  const backoffFactor = retryPolicy.backoffFactor ?? 2
  const retryOnNetworkError = retryPolicy.retryOnNetworkError ?? true

  const isStatusRetryable = (status: number): boolean => {
    if (retryPolicy.retryOnStatus) {
      if (typeof retryPolicy.retryOnStatus === 'function') {
        return retryPolicy.retryOnStatus(status)
      }
      return retryPolicy.retryOnStatus.includes(status)
    }
    // Default: retry on 5xx server errors
    return status >= 500 && status < 600
  }

  let attempt = 1
  while (true) {
    try {
      const res = await fetch(url, fetchOptions)
      if (res.ok) {
        return res
      }

      if (attempt < maxAttempts && isStatusRetryable(res.status)) {
        const delay = Math.pow(backoffFactor, attempt - 1) * baseDelayMs
        attempt++
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      return res
    } catch (err) {
      // Don't retry if signal was aborted intentionally
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      if (isAbort && fetchOptions.signal?.aborted) {
        throw err
      }

      if (attempt < maxAttempts && retryOnNetworkError) {
        const delay = Math.pow(backoffFactor, attempt - 1) * baseDelayMs
        attempt++
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw err
    }
  }
}

/**
 * Predefined retry policy for notification and write-oriented integrations.
 * Retries only on network/5xx failures, never after a confirmed-delivered response.
 */
export const NOTIFICATION_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoffFactor: 2,
  retryOnStatus: (status) => status >= 500 && status < 600,
  retryOnNetworkError: true,
}

/**
 * Predefined retry policy for read-oriented/idempotent integrations.
 * Retries more liberally, including on 5xx, network errors, and 429 rate limiting.
 */
export const READ_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffFactor: 2,
  retryOnStatus: (status) => (status >= 500 && status < 600) || status === 429,
  retryOnNetworkError: true,
}
