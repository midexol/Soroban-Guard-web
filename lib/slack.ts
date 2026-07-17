import type { Finding, Severity } from '@/types/findings'
import { fetchWithRetry, NOTIFICATION_RETRY_POLICY } from './httpClient'

const SEVERITY_ORDER: Record<Severity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4,
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (counts, finding) => {
      counts[finding.severity] += 1
      return counts
    },
    { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0,
},
  )
}

function getResultsUrl(): string | null {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem('sg_results_url') ?? window.location.href
}

/**
 * Post scan results as a structured message to a Slack webhook.
 * @param webhookUrl - Slack incoming webhook URL
 * @param findings - Array of scan findings
 * @param source - Contract source identifier shown in the message
 */
export async function postToSlack(
  webhookUrl: string,
  findings: Finding[],
  source: string,
): Promise<void> {
  if (!webhookUrl.trim()) return

  const counts = countBySeverity(findings)
  const topFindings = [...findings]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 3)
  const resultsUrl = getResultsUrl()
  const sourceLabel = source.length > 120 ? `${source.slice(0, 117)}...` : source

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Soroban Guard scan complete*\nSource: \`${sourceLabel}\``,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Total*\n${findings.length}` },
        { type: 'mrkdwn', text: `*Critical*\n${counts.Critical}` },
        { type: 'mrkdwn', text: `*High*\n${counts.High}` },
        { type: 'mrkdwn', text: `*Medium*\n${counts.Medium}` },
        { type: 'mrkdwn', text: `*Low*\n${counts.Low}` },
      ],
    },
    ...(resultsUrl
      ? [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `<${resultsUrl}|Open scan results>` },
          },
        ]
      : []),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: topFindings.length
          ? `*Top findings*\n${topFindings
              .map(
                finding =>
                  `*${finding.severity}* ${finding.check_name} in \`${finding.function_name}\` (${finding.file_path}:${finding.line})`,
              )
              .join('\n')}`
          : '*Top findings*\nNo findings detected.',
      },
    },
  ]

  try {
    const response = await fetchWithRetry(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      retryPolicy: NOTIFICATION_RETRY_POLICY,
    })
    if (!response.ok) throw new Error(`Slack webhook failed with ${response.status}`)
  } catch (error) {
    console.warn('Slack notification failed', error)
  }
}
