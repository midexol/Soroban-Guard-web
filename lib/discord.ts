import type { Finding, Severity } from '@/types/findings'
import { fetchWithRetry, NOTIFICATION_RETRY_POLICY } from './httpClient'

const SEVERITY_ORDER: Record<Severity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1
      return counts
    },
    { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0,
},
  )
}

function embedColor(findings: Finding[]): number {
  if (findings.some(finding => finding.severity === 'Critical' || finding.severity === 'High')) {
    return 0xdc2626
  }
  if (findings.some(finding => finding.severity === 'Medium')) {
    return 0xf59e0b
  }
  return 0x22c55e
}

function getResultsUrl(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem('sg_results_url') ?? window.location.href
}

/**
 * Post scan results as a rich embed to a Discord webhook.
 * @param webhookUrl - Discord incoming webhook URL
 * @param findings - Array of scan findings
 * @param source - Contract source identifier shown in the embed
 */
export async function postToDiscord(
  webhookUrl: string,
  findings: Finding[],
  source: string,
): Promise<void> {
  if (!webhookUrl.trim()) return

  const counts = countBySeverity(findings)
  const topFinding = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  )[0]
  const sourceLabel = source.length > 180 ? `${source.slice(0, 177)}...` : source
  const resultsUrl = getResultsUrl()

  const fields = [
    { name: 'Total', value: String(findings.length), inline: true },
    { name: 'Critical', value: String(counts.Critical), inline: true },
    { name: 'High', value: String(counts.High), inline: true },
    { name: 'Medium', value: String(counts.Medium), inline: true },
    { name: 'Low', value: String(counts.Low), inline: true },
  ]

  if (topFinding) {
    fields.push({
      name: 'Top finding',
      value: `${topFinding.severity}: ${topFinding.check_name} in ${topFinding.function_name}`,
      inline: false,
    })
  }

  try {
    const response = await fetchWithRetry(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: 'Soroban Guard scan complete',
            url: resultsUrl ?? undefined,
            description: `Source: \`${sourceLabel}\``,
            color: embedColor(findings),
            fields,
          },
        ],
      }),
      retryPolicy: NOTIFICATION_RETRY_POLICY,
    })
    if (!response.ok) throw new Error(`Discord webhook failed with ${response.status}`)
  } catch (error) {
    console.warn('Discord notification failed', error)
  }
}
