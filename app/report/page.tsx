'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Finding, Severity } from '@/types/findings'

const SEVERITY_ORDER: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4,
}
const SEVERITY_COLOR: Record<Severity, string> = {
  Critical: '#f43f5e',
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#38bdf8',
  Info: '#94a3b8',
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40"><rect width="40" height="40" rx="8" fill="#0f172a"/><path d="M12 8 L28 8 L20 32 Z" fill="#38bdf8"/><path d="M12 20 L28 20" stroke="#f43f5e" stroke-width="1.5" stroke-linecap="round"/></svg>`

export default function ReportPage() {
  const searchParams = useSearchParams()
  const [findings, setFindings] = useState<Finding[]>([])
  const [source, setSource] = useState('')
  const [scannedAt, setScannedAt] = useState('')
  const [score, setScore] = useState(100)
  const [walletAddress, setWalletAddress] = useState('')
  const [pageCount, setPageCount] = useState(1)

  useEffect(() => {
    try {
      const f = searchParams.get('f')
      if (f) setFindings(JSON.parse(atob(f)) as Finding[])
      setSource(searchParams.get('source') ?? 'Unknown')
      setScannedAt(searchParams.get('scannedAt') ?? new Date().toISOString())
      setScore(Number(searchParams.get('score') ?? 100))
      setWalletAddress(searchParams.get('wallet') ?? '')
    } catch {
      // ignore parse errors
    }
  }, [searchParams])

  useEffect(() => {
    if (findings.length >= 0 && source) {
      // Calculate page count: estimate ~8 findings per page, minimum 1
      const estimatedPages = Math.max(1, Math.ceil(findings.length / 8) + 1)
      setPageCount(estimatedPages)
      setTimeout(() => window.print(), 400)
    }
  }, [findings, source])

  const counts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0,
}
  for (const f of findings) counts[f.severity as Severity]++

  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER[a.severity as Severity] - SEVERITY_ORDER[b.severity as Severity])

  return (
    <>
      <style>{`
        @media print {
          @page {
            margin: 18mm 20mm;
            size: A4;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          body { background: #fff !important; color: #111 !important; }
          .page { padding: 0 !important; }
          .page-wrapper { position: relative; }
          .cover { page-break-after: always; }
          h2 { page-break-after: avoid; }
          .finding-block { page-break-inside: avoid; page-break-after: auto; }
          a { text-decoration: none; color: inherit; }
          .page-number { position: absolute; bottom: 10mm; right: 20mm; font-size: 11px; color: #9ca3af; }
        }
        body { font-family: system-ui, -apple-system, sans-serif; background: #fff; color: #111; margin: 0; font-size: 14px; line-height: 1.5; }
        .page { max-width: 900px; margin: 0 auto; padding: 40px 32px; position: relative; }
        .cover { border-bottom: 2px solid #e5e7eb; padding-bottom: 28px; margin-bottom: 28px; display: flex; align-items: flex-start; gap: 16px; }
        .logo { flex-shrink: 0; }
        .cover-content { flex: 1; }
        .cover h1 { font-size: 26px; font-weight: 700; margin: 0 0 8px; }
        .cover p { color: #6b7280; margin: 4px 0; font-size: 13px; }
        .score-badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-weight: 700; font-size: 16px; margin-top: 12px; }
        .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 28px; }
        .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; text-align: center; }
        .summary-card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .summary-card .value { font-size: 26px; font-weight: 700; }
        h2 { font-size: 16px; font-weight: 600; margin: 0 0 14px; color: #111; }
        .findings-list { display: flex; flex-direction: column; gap: 14px; }
        .finding-block { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; background: #fafafa; }
        .finding-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
        .sev { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.03em; white-space: nowrap; }
        .finding-title { font-weight: 600; font-size: 14px; color: #111; flex: 1; }
        .finding-location { font-size: 12px; color: #6b7280; font-family: monospace; }
        .finding-description { font-size: 13px; color: #374151; margin: 8px 0; line-height: 1.6; }
        .finding-remediation { margin-top: 8px; padding-top: 8px; border-top: 1px solid #d1d5db; font-size: 12px; color: #374151; }
        .finding-remediation strong { display: block; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
        .footer-note { margin-top: 36px; font-size: 11px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 14px; }
        .wallet-address { font-size: 11px; color: #6b7280; font-family: monospace; word-break: break-all; }
        @media (max-width: 600px) {
          .summary { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .page { padding: 24px 16px; }
          .cover { flex-direction: column; align-items: center; text-align: center; }
          .cover h1 { font-size: 22px; }
        }
      `}</style>

      <div className="page">
        {/* Cover */}
        <div className="cover">
          <div className="logo" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />
          <div className="cover-content">
            <h1>Soroban Guard — Security Report</h1>
            <p>Contract: {source}</p>
            <p>Scanned: {new Date(scannedAt).toLocaleString()}</p>
            {walletAddress && <p className="wallet-address">Scanned by: {walletAddress}</p>}
            <div
              className="score-badge"
              style={{ background: score >= 80 ? '#dcfce7' : score >= 50 ? '#fef9c3' : '#fee2e2', color: score >= 80 ? '#166534' : score >= 50 ? '#854d0e' : '#991b1b' }}
            >
              Security Score: {score}
            </div>
          </div>
        </div>

        {/* Summary */}
        <h2>Summary</h2>
        <div className="summary">
          {(['Critical', 'High', 'Medium', 'Low', 'Info'] as Severity[]).map(s => (
            <div key={s} className="summary-card">
              <div className="label">{s}</div>
              <div className="value" style={{ color: SEVERITY_COLOR[s] }}>{counts[s]}</div>
            </div>
          ))}
        </div>

        {/* Findings */}
        <h2>Findings ({findings.length})</h2>
        {findings.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 14 }}>No findings detected.</p>
        ) : (
          <div className="findings-list">
            {sorted.map((f, i) => (
              <div key={i} className="finding-block">
                <div className="finding-header">
                  <span className="sev" style={{ background: SEVERITY_COLOR[f.severity as Severity] }}>
                    {f.severity}
                  </span>
                  <div className="finding-title">{f.check_name}</div>
                </div>
                <div className="finding-location">
                  {f.file_path}:{f.line} — {f.function_name}
                </div>
                <div className="finding-description">{f.description}</div>
                {f.remediation && (
                  <div className="finding-remediation">
                    <strong>Recommended Fix</strong>
                    {f.remediation}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="footer-note">
          Generated by Soroban Guard · Veritas Vaults Network
        </p>
        <div className="page-number">Page <span className="page-num">1</span> of {pageCount}</div>
      </div>
    </>
  )
}
