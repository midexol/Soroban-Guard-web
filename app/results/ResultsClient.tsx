'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Finding, Severity } from '@/types/findings'
import { decodeFindingsParam, encodeWorkspace } from '@/lib/share'
import { exportEmail } from '@/lib/export'
import { exportJson, exportCsv, downloadMarkdown } from '@/lib/export'
import { exportSarif } from '@/lib/sarif'
import { getAllScanHistory } from '@/lib/history'
import { diffFindings } from '@/lib/diffFindings'
import { useToast } from '@/lib/toast'
import { useWallet } from '@/lib/WalletContext'
import { scanContract } from '@/lib/api'
import FindingsFilterBar from '@/components/FindingsFilterBar'
import { filterFindings, type FilterState } from '@/lib/filterFindings'
import FindingsTable from '@/components/FindingsTable'
import FindingsDiff from '@/components/FindingsDiff'
import FindingsByFunction from '@/components/FindingsByFunction'
import FindingsSkeleton from '@/components/FindingsSkeleton'
import FindingsWordCloud from '@/components/FindingsWordCloud'
import EmptyState from '@/components/EmptyState'
import SeverityBadge from '@/components/SeverityBadge'
import SeverityDonut from '@/components/SeverityDonut'
import ThemeToggle from '@/components/ThemeToggle'
import { generatePdfReport } from '@/lib/pdfReport'
import { calculateScore } from '@/lib/score'
import GithubExportModal from '@/components/GithubExportModal'
import JiraExportModal from '@/components/JiraExportModal'
import NotionExportModal from '@/components/NotionExportModal'
import TelegramNotifyModal from '@/components/TelegramNotifyModal'
import DiscordNotifyModal from '@/components/DiscordNotifyModal'
import SlackNotifyModal from '@/components/SlackNotifyModal'
import ResultsQRCode from '@/components/ResultsQRCode'
import { fetchContractTransactions, isValidContractId, type ContractTransaction } from '@/lib/stellar'
import { NETWORKS } from '@/types/stellar'

export default function ResultsClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { show } = useToast()
  const { publicKey: walletKey } = useWallet()
  const [findings, setFindings] = useState<Finding[] | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showGithubModal, setShowGithubModal] = useState(false)
  const [showJiraModal, setShowJiraModal] = useState(false)
  const [showNotionModal, setShowNotionModal] = useState(false)
  const [showLinearModal, setShowLinearModal] = useState(false)
  const [showQrModal, setShowQrModal] = useState(false)
  const [prevFindings, setPrevFindings] = useState<Finding[] | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [showWordCloud, setShowWordCloud] = useState(false)
  const [groupView, setGroupView] = useState<'flat' | 'function'>('flat')
  const [navIndex, setNavIndex] = useState<number | null>(null)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [contractTxs, setContractTxs] = useState<ContractTransaction[]>([])
  const [scanSource, setScanSource] = useState<string | null>(null)
  const [resultsUrl, setResultsUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isRescanning, setIsRescanning] = useState(false)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showTelegramModal, setShowTelegramModal] = useState(false)
  const [showDiscordModal, setShowDiscordModal] = useState(false)
  const [showSlackModal, setShowSlackModal] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(() => {
    const severityParam = searchParams.get('severity')
    const fileParam = searchParams.get('file')
    const mutedParam = searchParams.get('muted')
    return {
      severities: severityParam
        ? new Set(severityParam.split(',').map(s => s.charAt(0).toUpperCase() + s.slice(1)) as Severity[])
        : new Set<Severity>(['Critical', 'High', 'Medium', 'Low', 'Info']),
      fileFilter: fileParam || '',
      showMuted: mutedParam === 'show',
    }
  })

  useEffect(() => {
    const storedFindings = sessionStorage.getItem('sg_findings')
    const sharedParam = searchParams.get('r')

    if (sharedParam) {
      const decoded = decodeFindingsParam(sharedParam)
      if (decoded === null) {
        router.replace('/')
        return
      }
      setFindings(decoded)
      const shareableUrl = new URL('/results', window.location.origin)
      shareableUrl.searchParams.set('r', sharedParam)
      setResultsUrl(shareableUrl.toString())
    } else if (storedFindings) {
      try {
        setFindings(JSON.parse(storedFindings) as Finding[])
      } catch {
        router.replace('/')
        return
      }
    } else {
      router.replace('/')
      return
    }

    const source = sessionStorage.getItem('sg_last_scan_source') ?? sessionStorage.getItem('sg_scan_source')
    if (source) setScanSource(source)

    const d = sessionStorage.getItem('sg_scan_duration')
    if (d) setDuration(d)
  }, [router, searchParams])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '?') {
        e.preventDefault()
        setShowShortcutsModal(v => !v)
        return
      }
      if (findings && (e.key === 'j' || e.key === 'k')) {
        e.preventDefault()
        const current = navIndex ?? -1
        let next
        if (e.key === 'j') {
          next = Math.min(current + 1, findings.length - 1)
        } else {
          next = Math.max(current - 1, 0)
        }
        setNavIndex(next)
        const element = document.querySelector(`[data-finding-index="${next}"]`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [findings, navIndex])

  useEffect(() => {
    if (findings == null) return

    const source = sessionStorage.getItem('sg_last_scan_source') ?? sessionStorage.getItem('sg_scan_source')
    if (!source) return

    const history = getAllScanHistory()
    const prev = history.find(record => record.contractId === source && record.findings.length > 0)
    if (prev) {
      setPrevFindings(prev.findings as Finding[])
    }
  }, [findings])

  useEffect(() => {
    const source = sessionStorage.getItem('sg_last_scan_source') ?? sessionStorage.getItem('sg_scan_source')
    if (!source || !isValidContractId(source)) return

    const network = NETWORKS[sessionStorage.getItem('sg_network') ?? 'testnet'] ?? NETWORKS.testnet
    fetchContractTransactions(source, network).then(setContractTxs)
  }, [])

  // Sync filter state to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.delete('severity')
    params.delete('file')
    params.delete('muted')
    const allSeverities: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Info']
    if (filterState.severities.size < allSeverities.length) {
      params.set('severity', [...filterState.severities].map(s => s.toLowerCase()).join(','))
    }
    if (filterState.fileFilter) {
      params.set('file', filterState.fileFilter)
    }
    if (filterState.showMuted) {
      params.set('muted', 'show')
    }
    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', newUrl)
  }, [filterState])

  function handleScanAnother() {
    sessionStorage.removeItem('sg_findings')
    sessionStorage.removeItem('sg_scan_duration')
    router.push('/')
  }

  function flashCopied(message: string) {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
    show(message, 'success')
  }

  function handleCopyResultsUrl() {
    const url = resultsUrl || window.location.href
    navigator.clipboard.writeText(url)
    flashCopied('Link copied!')
  }

  function getEmbedToken(): string {
    return searchParams.get('r') ?? ''
  }

  function getEmbedSnippet(): string {
    const token = getEmbedToken()
    const origin = window.location.origin
    return `<iframe src="${origin}/embed/${token}" width="300" height="150" frameborder="0" style="border-radius:12px;overflow:hidden;" title="Soroban Guard Security Status"></iframe>`
  }

  function handleCopyEmbed() {
    navigator.clipboard.writeText(getEmbedSnippet())
    flashCopied('Embed code copied!')
  }

  async function handleRescan() {
    if (!scanSource) {
      show('No scan source found', 'error')
      return
    }

    setIsRescanning(true)
    try {
      const data = await scanContract(scanSource)
      setFindings(data.findings)
      sessionStorage.setItem('sg_findings', JSON.stringify(data.findings))
      flashCopied('Rescan complete!')
    } catch {
      show('Rescan failed', 'error')
    } finally {
      setIsRescanning(false)
    }
  }

  function handleCopyCli() {
    if (!scanSource) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const command = `curl -X POST ${apiUrl}/scan -H 'Content-Type: application/json' -d '{"source":"${scanSource.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"}'`

    navigator.clipboard.writeText(command)
    flashCopied('CLI command copied to clipboard')
  }

  function handleDownloadPdf() {
    generatePdfReport(findings ?? [], {
      source: scanSource ?? 'Unknown',
      scannedAt: new Date().toISOString(),
      score: calculateScore(findings ?? []),
      walletAddress: walletKey ?? undefined,
    })
  }

  function handleDownloadSarif() {    const content = exportSarif(findings ?? [])
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'soroban-guard.sarif'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function handleShareWorkspace() {
    if (!scanSource) {
      show('No scan source found', 'error')
      return
    }

    const token = encodeWorkspace(scanSource, findings ?? [])
    const workspaceUrl = `${window.location.origin}/workspace/${token}`
    navigator.clipboard.writeText(workspaceUrl)
    flashCopied('Workspace link copied!')
  }

  function handleOpenQrModal() {
    if (!resultsUrl) return
    setShowQrModal(true)
  }

  function handleAttest() {
    show('Attestation is not available in this build', 'error')
  }

  if (findings === null) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <FindingsSkeleton />
      </div>
    )
  }

  const counts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 }
  for (const finding of findings) counts[finding.severity]++

  const filteredByFilters = filterFindings(findings, filterState)
  const q = searchQuery.toLowerCase()
  const filteredFindings = q
    ? filteredByFilters.filter(
        finding =>
          finding.check_name.toLowerCase().includes(q) ||
          finding.function_name.toLowerCase().includes(q) ||
          finding.file_path.toLowerCase().includes(q) ||
          finding.description.toLowerCase().includes(q),
      )
    : filteredByFilters

  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard
  const hasSource = Boolean(scanSource)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <button
            onClick={handleScanAnother}
            className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="hidden sm:inline">Soroban Guard</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            {hasSource && (
              <button
                onClick={handleRescan}
                disabled={isRescanning}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRescanning ? 'Rescanning...' : 'Rescan'}
              </button>
            )}
            {/* Secondary actions — visible on desktop, collapsed on mobile */}
            <div className="hidden items-center gap-2 sm:flex">
              {findings.length === 0 && walletKey && (
                <button
                  onClick={handleAttest}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  View attestation on Stellar.expert
                </button>
              )}
            <a
              href={exportEmail(findings)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Email summary
            </a>
            <button
              onClick={handleDownloadSarif}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Download SARIF
            </button>
            <button
              onClick={handleDownloadPdf}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Download PDF
            </button>
            <button
              onClick={() => exportJson(findings)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Download JSON
            </button>
            <button
              onClick={() => exportCsv(findings)}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Download CSV
            </button>
            <button
              onClick={() => downloadMarkdown(findings, { source: scanSource ?? 'Unknown', scannedAt: new Date().toISOString() })}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Download Markdown
            </button>
            {findings.length > 0 && (
              <button
                onClick={() => setShowNotionModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
              >
                Export to Notion
              </button>
            )}
            {findings.length > 0 && (
              <button
                onClick={() => setShowTelegramModal(true)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
              >
                Notify Telegram
              </button>
            )}
            {findings.length > 0 && (
              <button
                onClick={() => setShowDiscordModal(true)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
              >
                Notify Discord
              </button>
            )}
            {findings.length > 0 && (
              <button
                onClick={() => setShowSlackModal(true)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
              >
                Notify Slack
              </button>
            )}
            {getEmbedToken() && (
              <>
                <button
                  onClick={handleShareWorkspace}
                  disabled={!canCopy}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Share workspace
                </button>
                {resultsUrl && (
                  <button
                    onClick={handleOpenQrModal}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h5v5H4V4zm11 0h5v5h-5V4zM4 15h5v5H4v-5zm9 0h2m2 0h3m-7 3h3m4-4v6" />
                    </svg>
                    QR code
                  </button>
                )}
              </>
            )}
          </div>
            {/* Mobile actions dropdown */}
            <div className="relative sm:hidden">
              <button
                onClick={() => setShowActionsMenu(v => !v)}
                aria-label="More actions"
                aria-expanded={showActionsMenu}
                className="rounded-lg border border-[var(--border)] p-2 text-slate-400 transition hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {showActionsMenu && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-xl"
                  role="menu"
                >
                  <button
                    onClick={() => { handleDownloadPdf(); setShowActionsMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                    role="menuitem"
                  >
                    Download PDF
                  </button>
                  <button
                    onClick={() => { handleDownloadSarif(); setShowActionsMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                    role="menuitem"
                  >
                    Download SARIF
                  </button>
                  <a
                    href={exportEmail(findings)}
                    className="block px-4 py-2.5 text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                    role="menuitem"
                  >
                    Email summary
                  </a>
                  {canCopy && (
                    <button
                      onClick={() => { handleShareWorkspace(); setShowActionsMenu(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                      role="menuitem"
                    >
                      Share workspace
                    </button>
                  )}
                  {findings.length > 0 && (
                    <>
                      <button
                        onClick={() => { setShowGithubModal(true); setShowActionsMenu(false) }}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                        role="menuitem"
                      >
                        Create GitHub Issues
                      </button>
                      <button
                        onClick={() => { setShowNotionModal(true); setShowActionsMenu(false) }}
                        className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                        role="menuitem"
                      >
                        Export to Notion
                      </button>
                    </>
                  )}
                  {findings.some(f => f.severity === 'Critical' || f.severity === 'High') && (
                    <button
                      onClick={() => { setShowJiraModal(true); setShowActionsMenu(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-[var(--bg-hover)] hover:text-white"
                      role="menuitem"
                    >
                      Export to Jira
                    </button>
                  )}
                  {findings.length === 0 && walletKey && (
                    <button
                      onClick={() => { handleAttest(); setShowActionsMenu(false) }}
                      className="w-full px-4 py-2.5 text-left text-sm text-emerald-400 hover:bg-[var(--bg-hover)]"
                      role="menuitem"
                    >
                      Attest on Stellar
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={handleScanAnother}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 sm:px-4"
            >
              <span className="hidden sm:inline">Scan another contract</span>
              <span className="sm:hidden">New scan</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pb-10">
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">Scan Results</h1>
            <div className="relative flex items-center gap-2">
              {scanSource && (
                <button
                  onClick={handleCopyCli}
                  disabled={!canCopy}
                  title="Copy CLI command"
                  className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-sm text-slate-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy CLI command
                </button>
              )}
              <button
                onClick={handleCopyResultsUrl}
                disabled={!canCopy}
                title={canCopy ? 'Copy results link' : 'Clipboard API unavailable'}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-[#1a1d27] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              {copied && (
                <div className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-green-600 px-3 py-1 text-xs text-white">
                  Copied!
                </div>
              )}
            </div>
          </div>
          <p className="mb-6 text-sm text-slate-500">
            {findings.length === 0
              ? 'No issues detected.'
              : `${findings.length} finding${findings.length !== 1 ? 's' : ''} detected across your contract.`}
            {duration && <span className="ml-2 text-slate-600">Scanned in {duration}s</span>}
          </p>

          <div className="flex gap-6">
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <SummaryCard
                  label="Critical"
                  value={counts.Critical}
                  color="text-rose-400"
                  bg="bg-rose-500/5"
                  border="border-rose-500/20"
                />
                <SummaryCard
                  label="High"
                  value={counts.High}
                  color="text-red-400"
                  bg="bg-red-500/5"
                  border="border-red-500/20"
                />
                <SummaryCard
                  label="Medium"
                  value={counts.Medium}
                  color="text-amber-400"
                  bg="bg-amber-500/5"
                  border="border-amber-500/20"
                />
                <SummaryCard
                  label="Low"
                  value={counts.Low}
                  color="text-sky-400"
                  bg="bg-sky-500/5"
                  border="border-sky-500/20"
                />
                <SummaryCard
                  label="Info"
                  value={counts.Info}
                  color="text-slate-400"
                  bg="bg-slate-500/5"
                  border="border-slate-500/20"
                />
                {duration && (
                  <SummaryCard
                    label="Scan Time"
                    value={duration}
                    color="text-indigo-400"
                    bg="bg-indigo-500/5"
                    border="border-indigo-500/20"
                  />
                )}
              </div>
            </div>
            {findings.length > 0 && (
              <div className="flex-shrink-0">
                <SeverityDonut counts={counts} />
              </div>
            )}
          </div>
        </div>

        {findings.length === 0 ? (
          <EmptyState onScanAnother={handleScanAnother} />
        ) : (
          <div>
            <div className="mb-6">
              <button
                onClick={() => setShowWordCloud(v => !v)}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-[var(--bg-hover)]"
                aria-expanded={showWordCloud}
              >
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Vulnerability themes
                </span>
                <svg
                  className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${showWordCloud ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showWordCloud && (
                <div className="mt-2">
                  <FindingsWordCloud findings={findings} onTermClick={term => setSearchQuery(term)} />
                </div>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400">Findings - click a row to expand details</h2>
              <div className="flex items-center gap-2">
                {prevFindings && (
                  <button
                    onClick={() => setShowDiff(v => !v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      showDiff
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                        : 'border-[var(--border)] text-slate-400 hover:text-white'
                    }`}
                  >
                    {showDiff ? 'Hide diff' : 'Show diff from last scan'}
                  </button>
                )}
                {!showDiff && (
                  <div className="overflow-hidden rounded-lg border border-[var(--border)] text-xs font-medium">
                    <button
                      onClick={() => setGroupView('flat')}
                      className={`px-3 py-1.5 transition ${groupView === 'flat' ? 'bg-indigo-500/10 text-indigo-300' : 'text-slate-400 hover:text-white'}`}
                    >
                      Flat
                    </button>
                    <button
                      onClick={() => setGroupView('function')}
                      className={`border-l border-[var(--border)] px-3 py-1.5 transition ${groupView === 'function' ? 'bg-indigo-500/10 text-indigo-300' : 'text-slate-400 hover:text-white'}`}
                    >
                      Group by function
                    </button>
                  </div>
                )}
                {(['Critical', 'High', 'Medium', 'Low'] as Severity[]).map(s =>
                  counts[s] > 0 ? (
                    <SeverityBadge key={s} severity={s} size="sm" />
                  ) : null,
                )}
              </div>
            </div>

            {showDiff && prevFindings ? (
              <FindingsDiff diff={diffFindings(prevFindings, findings)} />
            ) : (
              <>
                <div className="relative mb-4">
                  <label htmlFor="findings-search" className="sr-only">
                    Search findings
                  </label>
                  <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    id="findings-search"
                    type="search"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by check, function, file, or description..."
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] py-2 pl-9 pr-9 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {filteredFindings.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">No findings match your search.</p>
                ) : groupView === 'function' ? (
                  <FindingsByFunction findings={filteredFindings} />
                ) : (
                  <>
                    <FindingsFilterBar
                      findings={findings}
                      filterState={filterState}
                      onFilterChange={setFilterState}
                    />
                    <FindingsTable
                      findings={[...filteredFindings].sort((a, b) => {
                        const order: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4,
}
                        return order[a.severity] - order[b.severity]
                      })}
                      searchQuery={searchQuery}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {contractTxs.length > 0 && (
          <section className="mt-10" aria-labelledby="tx-history-heading">
            <h2 id="tx-history-heading" className="mb-3 text-sm font-semibold text-slate-400">
              Recent Transactions
            </h2>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-xs text-slate-500">
                    <th className="px-4 py-2 text-left font-medium">Hash</th>
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-right font-medium">Ops</th>
                    <th className="px-4 py-2 text-right font-medium">Fee (stroops)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {contractTxs.map(tx => (
                    <tr key={tx.id} className="bg-[var(--bg)] transition hover:bg-[var(--bg-secondary)]">
                      <td className="px-4 py-2 font-mono text-xs text-indigo-400">
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {tx.hash.slice(0, 12)}…
                        </a>
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-300">{tx.operation_count}</td>
                      <td className="px-4 py-2 text-right text-slate-300">{tx.fee_charged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <button
        onClick={handleScanAnother}
        aria-label="Scan another contract"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 sm:hidden"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        New scan
      </button>

      <footer className="border-t border-[var(--border)] py-6 text-center text-xs text-slate-600">
        Soroban Guard · Veritas Vaults Network
      </footer>

      {showGithubModal && (
        <GithubExportModal findings={findings} onClose={() => setShowGithubModal(false)} />
      )}
      {showJiraModal && (
        <JiraExportModal findings={findings} onClose={() => setShowJiraModal(false)} />
      )}
      {showNotionModal && (
        <NotionExportModal findings={findings} onClose={() => setShowNotionModal(false)} />
      )}
      {showTelegramModal && (
        <TelegramNotifyModal findings={findings} source={scanSource ?? ''} onClose={() => setShowTelegramModal(false)} />
      )}
      {showDiscordModal && (
        <DiscordNotifyModal findings={findings} source={scanSource ?? ''} onClose={() => setShowDiscordModal(false)} />
      )}
      {showSlackModal && (
        <SlackNotifyModal findings={findings} source={scanSource ?? ''} onClose={() => setShowSlackModal(false)} />
      )}
      {showShortcutsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Keyboard Shortcuts</h2>
              <button
                onClick={() => setShowShortcutsModal(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-[var(--border)]">
                {[
                  ['j', 'Next finding'],
                  ['k', 'Previous finding'],
                  ['?', 'Toggle this help'],
                ].map(([key, desc]) => (
                  <tr key={key}>
                    <td className="py-2 pr-4">
                      <kbd className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-0.5 font-mono text-xs text-slate-300">
                        {key}
                      </kbd>
                    </td>
                    <td className="py-2 text-slate-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
  bg,
  border,
}: {
  label: string
  value: number | string
  color: string
  bg: string
  border?: string
}) {
  return (
    <div className={`rounded-xl border ${border || 'border-[var(--border)]'} ${bg} p-4`}>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
