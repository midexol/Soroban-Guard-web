'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Finding } from '@/types/findings'
import ConfirmModal from '@/components/ConfirmModal'
import SeverityTrendChart from '@/components/SeverityTrendChart'
import ScanHeatmap from '@/components/ScanHeatmap'
import {
  addSchedule,
  removeSchedule,
  getSchedule,
  type ScheduleInterval,
} from '@/lib/schedule'

interface HistoryEntry {
  id: string
  date: string
  source: string
  findings: Finding[]
}

const STORAGE_KEY = 'sg_history'

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export default function HistoryPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  // Track schedule state per entry id
  const [schedules, setSchedules] = useState<Record<string, ScheduleInterval | null>>({})

  useEffect(() => {
    const loaded = loadHistory()
    setEntries(loaded)
    // Load existing schedules for each entry
    const initial: Record<string, ScheduleInterval | null> = {}
    for (const e of loaded) {
      const s = getSchedule(e.source, 'testnet')
      initial[e.id] = s?.interval ?? null
    }
    setSchedules(initial)
    setLoading(false)
  }, [])

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY)
    setEntries([])
    setShowConfirm(false)
  }

  function handleScheduleChange(entry: HistoryEntry, interval: ScheduleInterval | 'never') {
    if (interval === 'never') {
      removeSchedule(entry.source, 'testnet')
      setSchedules(prev => ({ ...prev, [entry.id]: null }))
    } else {
      addSchedule(entry.source, 'testnet', interval)
      setSchedules(prev => ({ ...prev, [entry.id]: interval }))
    }
  }

  if (loading) {
    return (
      <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading scan history">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-36 animate-pulse rounded-lg bg-[#1a1d27]" />
          <div className="h-9 w-24 animate-pulse rounded-lg bg-[#1a1d27]" />
        </div>
        <ul className="space-y-3" aria-label="Loading scan history" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-xl border border-[#2a2d3a] bg-[#12151f] px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="h-4 w-48 animate-pulse rounded bg-[#1a1d27]" />
                <div className="h-3 w-20 animate-pulse rounded bg-[#1a1d27]" />
              </div>
              <div className="mt-2 h-3 w-24 animate-pulse rounded bg-[#1a1d27]" />
              <div className="mt-3 flex items-center gap-2">
                <div className="h-3 w-3 animate-pulse rounded bg-[#1a1d27]" />
                <div className="h-3 w-12 animate-pulse rounded bg-[#1a1d27]" />
                <div className="h-5 w-14 animate-pulse rounded-md bg-[#1a1d27]" />
                <div className="h-5 w-14 animate-pulse rounded-md bg-[#1a1d27]" />
                <div className="h-5 w-14 animate-pulse rounded-md bg-[#1a1d27]" />
              </div>
            </li>
          ))}
        </ul>
      </main>
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Scan History</h1>
        <div className="flex items-center gap-3">
          <a
            href="/analytics"
            className="rounded-lg border border-[#2a2d3a] px-4 py-2 text-sm text-slate-400 transition hover:text-white"
          >
            Analytics
          </a>
          {entries.length > 0 && (
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
            >
              Clear history
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No scan history yet.</p>
      ) : (
        <>
          {entries.length >= 7 && (
            <div className="mb-6">
              <ScanHeatmap entries={entries.map(e => ({ date: e.date }))} />
            </div>
          )}
          {entries.length >= 2 && (
            <div className="mb-6">
              <SeverityTrendChart
                data={entries.map(e => ({
                  date: new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                  High: e.findings.filter(f => f.severity === 'High').length,
                  Medium: e.findings.filter(f => f.severity === 'Medium').length,
                  Low: e.findings.filter(f => f.severity === 'Low').length,
                }))}
              />
            </div>
          )}
          <ul className="space-y-3">
            {entries.map(e => (
              <li
                key={e.id}
                className="rounded-xl border border-[#2a2d3a] bg-[#12151f] px-5 py-4"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono text-sm text-slate-300">{e.source}</span>
                  <span className="ml-4 shrink-0 text-xs text-slate-500">
                    {new Date(e.date).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {e.findings.length} finding{e.findings.length !== 1 ? 's' : ''}
                </p>
                {/* Schedule rescan toggle */}
                <div className="mt-3 flex items-center gap-2">
                  <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-slate-500">Rescan:</span>
                  {(['never', 'daily', 'weekly'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleScheduleChange(e, opt)}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                        (opt === 'never' && !schedules[e.id]) || schedules[e.id] === opt
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {showConfirm && (
        <ConfirmModal
          title="Clear all history?"
          description="This will permanently delete all scan records from this browser. This cannot be undone."
          confirmLabel="Clear history"
          onConfirm={clearHistory}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </main>
  )
}
