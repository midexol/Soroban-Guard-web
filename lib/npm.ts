import { fetchWithRetry, READ_RETRY_POLICY } from './httpClient'

const NPM_PACKAGE_SEGMENT_RE = /^[a-z0-9][a-z0-9._-]*$/
const NPM_PACKAGE_NAME_RE = /^(?:@([a-z0-9][a-z0-9._-]*)\/)?([a-z0-9][a-z0-9._-]*)$/
const MAX_NPM_SOURCE_CHARS = 100_000

/**
 * Validate an npm package name.
 * @param packageName - Package name to validate (supports scoped packages)
 * @returns True if the name is a valid npm package name
 */
export function isValidNpmPackage(packageName: string): boolean {
  const trimmed = packageName.trim()
  if (trimmed.length === 0 || trimmed.length > 214) return false
  return NPM_PACKAGE_NAME_RE.test(trimmed)
}

export function buildUnpkgPackagePath(packageName: string): string {
  const trimmed = packageName.trim()
  const scopedMatch = trimmed.match(/^@([^/]+)\/(.+)$/)

  if (scopedMatch) {
    const [, scope, name] = scopedMatch
    return `@${encodeURIComponent(scope)}/${encodeURIComponent(name)}`
  }

  if (!NPM_PACKAGE_SEGMENT_RE.test(trimmed)) {
    throw new Error('Invalid package name')
  }

  return encodeURIComponent(trimmed)
}

/**
 * Fetch the main source file of an npm package via unpkg.com.
 * @param packageName - npm package name (supports scoped packages)
 * @param version - Optional version string
 * @returns Raw source text (max 100,000 chars)
 * @throws If the package is not found, too large, or the request times out
 */
export async function fetchNpmSource(packageName: string, version?: string): Promise<string> {
  const trimmed = packageName.trim()
  if (!isValidNpmPackage(trimmed)) {
    throw new Error('Invalid package name - use lowercase npm package format (e.g., @scope/package-name)')
  }

  const versionStr = version?.trim() ? `@${encodeURIComponent(version.trim())}` : ''
  const url = `https://unpkg.com/${buildUnpkgPackagePath(trimmed)}${versionStr}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetchWithRetry(url, {
      signal: controller.signal,
      retryPolicy: READ_RETRY_POLICY,
    })

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Package not found on npm')
      }
      throw new Error(`unpkg returned ${res.status}`)
    }

    const content = await res.text()

    if (content.length > MAX_NPM_SOURCE_CHARS) {
      throw new Error(`File too large (${content.length.toLocaleString()} chars) - maximum 100,000 characters`)
    }

    return content
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('npm package fetch timed out after 15 s')
    }
    if (err instanceof Error && err.message.includes('too large')) {
      throw err
    }
    throw err instanceof Error ? err : new Error('Failed to fetch npm package')
  } finally {
    clearTimeout(timeout)
  }
}
