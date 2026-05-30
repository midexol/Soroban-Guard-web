'use client'

import { useId, useState } from 'react'
import type { Finding } from '@/types/findings'
import { createNotionPage } from '@/lib/notion'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface Props {
  findings: Finding[]
  onClose: () => void
}

export default function NotionExportModal({ findings, onClose }: Props) {
  const [token, setToken] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPageUrl(null)
    setLoading(true)
    try {
      const url = await createNotionPage(token.trim(), databaseId.trim(), findings)
      setPageUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-2xl border border-[#2a2d3a] bg-[#0e1117] p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-white">Export to Notion</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded" aria-label="Close dialog">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {pageUrl ? (
          <div className="space-y-4">
            <p className="text-sm text-green-400">Page created successfully.</p>
            <a
              href={pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm text-indigo-400 underline"
            >
              {pageUrl}
            </a>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="notion-token">
                Integration token
              </label>
              <input
                id="notion-token"
                type="password"
                required
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="secret_..."
                className="w-full rounded-lg border border-[#2a2d3a] bg-[#161922] px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-slate-600">Never stored — used only for this request.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400" htmlFor="notion-db">
                Database ID
              </label>
              <input
                id="notion-db"
                type="text"
                required
                value={databaseId}
                onChange={e => setDatabaseId(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded-lg border border-[#2a2d3a] bg-[#161922] px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {loading ? 'Creating page…' : 'Create Notion page'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
