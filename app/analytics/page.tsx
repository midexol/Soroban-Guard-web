'use client'

import { useEffect, useState } from 'react'
import { getAllScanHistory } from '@/lib/history'
import { computeAnalytics, checkTrend, allCheckNames, type Analytics } from '@/lib/analytics'
import type { ContractScanRecord } from '@/types/stellar'
import ThemeToggle from '@/components/ThemeToggle'
import CheckTrendChart from '@/components/CheckTrendChart'

const MIN_RECORDS = 3

export default function AnalyticsPage() {
  const [records, setRecords] = useState<ContractScanRecord[] | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [selectedCheck, setSelectedCheck] = useState<string>('')

  useEffect(() => {
    const all = getAllScanHistory()
    setRecords(all)
    setAnalytics(computeAnalytics(all))
    const names = allCheckNames(all)
    if (names.length > 0) setSelectedCheck(names[0])
  }, [])

  if (records === null || analytics === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading analytics">
        <svg className="spinner h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      </div>
    )
  }

  const isEmpty = records.length < MIN_RECORDS

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/history" className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Scan History
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="mb-2 text-2xl font-bold text-white">Portfolio Analytics</h1>
        <p className="mb-8 text-sm text-slate-500">Aggregate statistics across all scans in your history.</p>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[#12151f] py-20 text-center">
            <svg className="mb-4 h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {records.length === 0 ? (
              <>
                <p className="text-sm font-medium text-slate-400">No scan history yet</p>
                <p className="mt-1 text-xs text-slate-600">
                  Run your first scan to start seeing analytics.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-400">Not enough data yet</p>
                <p className="mt-1 text-xs text-slate-600">
                  Run at least {MIN_RECORDS} scans to see analytics.{' '}
                  {`(${records.length} of ${MIN_RECORDS} so far)`}
                </p>
              </>
            )}
            <a
              href="/"
              className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#12151f]"
            >
              {records.length === 0 ? 'Run your first scan' : 'Scan a contract'}
            </a>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total scans" value={analytics.totalScans} color="text-white" />
              <StatCard label="Avg findings / scan" value={analytics.avgScore} color="text-indigo-400" />
              <StatCard label="Total high" value={analytics.totalFindings.high} color="text-red-400" />
              <StatCard label="Total medium" value={analytics.totalFindings.medium} color="text-amber-400" />
            </div>

            {/* Top checks bar chart */}
            <div className="rounded-xl border border-[var(--border)] bg-[#12151f] p-6">
              <h2 className="mb-5 text-sm font-semibold text-slate-300">Top 5 most frequent checks</h2>
              {analytics.topChecks.length === 0 ? (
                <p className="text-sm text-slate-500">No findings recorded yet.</p>
              ) : (
                <TopChecksChart checks={analytics.topChecks} />
              )}
            </div>

            {/* Per-check trend */}
            {allCheckNames(records).length > 0 && (() => {
              const names = allCheckNames(records)
              const trendData = checkTrend(records, selectedCheck)
              return (
                <div className="mt-6 rounded-xl border border-[var(--border)] bg-[#12151f] p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-slate-300">Findings severity trend by check</h2>
                    <select
                      value={selectedCheck}
                      onChange={e => setSelectedCheck(e.target.value)}
                      className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      aria-label="Select check name"
                    >
                      {names.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  {trendData.length < 2 ? (
                    <p className="text-sm text-slate-500">Not enough data points to show a trend for this check.</p>
                  ) : (
                    <CheckTrendChart data={trendData} checkName={selectedCheck} />
                  )}
                </div>
              )
            })()}
          </>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-slate-600">
        Soroban Guard · Veritas Vaults Network
      </footer>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[#12151f] px-5 py-4">
      <p className="mb-1 text-xs text-slate-500" id={`stat-${label.replace(/\s+/g, '-').toLowerCase()}`}>{label}</p>
      <p
        className={`text-3xl font-bold ${color}`}
        aria-labelledby={`stat-${label.replace(/\s+/g, '-').toLowerCase()}`}
      >
        {value}
      </p>
    </div>
  )
}

function TopChecksChart({ checks }: { checks: { name: string; count: number }[] }) {
  const max = checks[0]?.count ?? 1
  return (
    <ul className="space-y-3" role="list" aria-label="Top checks by frequency">
      {checks.map(({ name, count }) => (
        <li key={name}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-300">{name}</span>
            <span className="text-slate-500">{count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#1a1d27]">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${(count / max) * 100}%` }}
              role="progressbar"
              aria-valuenow={count}
              aria-valuemax={max}
              aria-label={name}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
