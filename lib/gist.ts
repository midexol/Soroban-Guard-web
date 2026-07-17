import { fetchWithRetry, READ_RETRY_POLICY } from './httpClient'

const GIST_URL_RE = /^https:\/\/gist\.github\.com\/([^/]+)\/([a-f0-9]+)\/?$/i

export interface GistFile {
  filename: string
  language: string | null
  raw_url: string
  content?: string
}

/**
 * Validate a GitHub Gist URL.
 * @param url - URL to validate
 * @returns True if the URL matches the expected Gist format
 */
export function isValidGistUrl(url: string): boolean {
  return GIST_URL_RE.test(url.trim())
}

export interface GistData {
  id: string
  files: GistFile[]
}

/**
 * Fetch gist metadata and file list from the GitHub Gist API.
 * Returns the list of files with their raw_url for content fetching.
 */
export async function fetchGistFiles(url: string): Promise<GistData> {
  const match = url.trim().match(GIST_URL_RE)
  if (!match) throw new Error('Invalid Gist URL. Expected: https://gist.github.com/{user}/{id}')

  const gistId = match[2]
  const apiUrl = `https://api.github.com/gists/${gistId}`

  const res = await fetchWithRetry(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    retryPolicy: READ_RETRY_POLICY,
  })

  if (res.status === 404) throw new Error('Gist not found. Make sure it is public.')
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`)

  const data = await res.json()
  const files: GistFile[] = Object.values(data.files as Record<string, any>).map(f => ({
    filename: f.filename,
    language: f.language ?? null,
    raw_url: f.raw_url,
  }))

  return { id: gistId, files }
}

/**
 * Fetch the raw content of a single gist file.
 */
export async function fetchGistFileContent(rawUrl: string): Promise<string> {
  const res = await fetchWithRetry(rawUrl, {
    retryPolicy: READ_RETRY_POLICY,
  })
  if (!res.ok) throw new Error(`Failed to fetch gist file: ${res.status}`)
  return res.text()
}
