'use client'

import { useId, useState } from 'react'
import type { Finding } from '@/types/findings'
import { createIssuesForFindings } from '@/lib/githubExport'
import { useFocusTrap } from '@/lib/useFocusTrap'

interface Props {
  findings: Finding[]
  onClose: () => void
}

export default function GithubExportModal({ findings, onClose }: Props) {
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [urls, setUrls] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose)

  const busy = progress !== null && urls === null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setUrls(null)
    setProgress({ done: 0, total: findings.length })
    try {
      const created = await createIssuesForFindings(
        findings,
        owner.trim(),
        repo.trim(),
        token,
        (done, total) => setProgress({ done, total }),
      )
      setUrls(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setProgress(null)
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
          <h2 id={titleId} className="text-base font-semibold text-white">Create GitHub Issues</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded" aria-label="Close dialog">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {urls ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-400">✓ Created {urls.length} issue{urls.length !== 1 ? 's' : ''}</p>
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {urls.map(url => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline break-all">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
            <button onClick={onClose} className="mt-2 w-full rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <input
                required
                value={owner}
                onChange={e => setOwner(e.target.value)}
                placeholder="owner"
                disabled={busy}
                className="flex-1 rounded-lg border border-[#2a2d3a] bg-[#12151f] px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50"
              />
              <span className="flex items-center text-slate-500">/</span>
              <input
                required
                value={repo}
                onChange={e => setRepo(e.target.value)}
                placeholder="repo"
                disabled={busy}
                className="flex-1 rounded-lg border border-[#2a2d3a] bg-[#12151f] px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50"
              />
            </div>
            <input
              required
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="GitHub Personal Access Token"
              disabled={busy}
              className="w-full rounded-lg border border-[#2a2d3a] bg-[#12151f] px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50"
            />
            <p className="text-xs text-slate-500">Token requires <code className="rounded bg-[#1a1d27] px-1 text-slate-400">repo</code> scope. It is never stored.</p>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            {progress && (
              <div className="space-y-1">
                <p className="text-xs text-slate-400">Creating issue {progress.done} of {progress.total}…</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2a2d3a]">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              {busy ? 'Creating…' : `Create ${findings.length} issue${findings.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
