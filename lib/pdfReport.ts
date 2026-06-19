import type { Finding } from '@/types/findings'

export interface ReportMetadata {
  source: string
  scannedAt: string
  score: number
  walletAddress?: string
}

/**
 * Open the print/PDF report page in a new tab with findings encoded in the URL.
 * @param findings - Array of scan findings
 * @param metadata - Report metadata including source, scan time, score, and optional wallet address
 */
export function generatePdfReport(findings: Finding[], metadata: ReportMetadata): void {
  const params = new URLSearchParams({
    f: btoa(JSON.stringify(findings)),
    source: metadata.source,
    scannedAt: metadata.scannedAt,
    score: String(metadata.score),
  })
  if (metadata.walletAddress) {
    params.set('wallet', metadata.walletAddress)
  }
  window.open(`/report?${params.toString()}`, '_blank')
}
