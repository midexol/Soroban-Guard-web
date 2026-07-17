import { fetchWithRetry, READ_RETRY_POLICY } from './httpClient'

const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{55})$/

/**
 * Validate an IPFS CID (v0 Qm… or v1 bafy…).
 * @param cid - CID string to validate
 * @returns True if the CID matches a known format
 */
export function isValidCid(cid: string): boolean {
  return CID_RE.test(cid.trim())
}

/**
 * Fetch the raw content of an IPFS resource via the public ipfs.io gateway.
 * @param cid - Valid IPFS CID
 * @returns Raw text content of the resource
 * @throws If the gateway returns an error or the request times out after 15 s
 */
export async function fetchFromIpfs(cid: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetchWithRetry(`https://ipfs.io/ipfs/${encodeURIComponent(cid.trim())}`, {
      signal: controller.signal,
      retryPolicy: READ_RETRY_POLICY,
    })
    if (!res.ok) throw new Error(`IPFS gateway returned ${res.status}`)
    return await res.text()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('IPFS fetch timed out after 15 s')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
