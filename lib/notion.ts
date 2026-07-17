import type { Finding } from '@/types/findings'
import { fetchWithRetry, NOTIFICATION_RETRY_POLICY } from './httpClient'

const NOTION_API = 'https://api.notion.com/v1'

/**
 * Create a Notion database page containing a findings table.
 * @param token - Notion integration token
 * @param databaseId - Target Notion database ID
 * @param findings - Array of scan findings
 * @returns URL of the created Notion page
 */
export async function createNotionPage(
  token: string,
  databaseId: string,
  findings: Finding[],
): Promise<string> {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const title = `Soroban Guard Scan — ${date}`

  // Build table rows as child blocks
  const headerRow = {
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: [
        [{ type: 'text', text: { content: 'Severity' } }],
        [{ type: 'text', text: { content: 'Check Name' } }],
        [{ type: 'text', text: { content: 'Function' } }],
        [{ type: 'text', text: { content: 'Line' } }],
        [{ type: 'text', text: { content: 'Description' } }],
      ],
    },
  }

  const rows = findings.map(f => ({
    object: 'block',
    type: 'table_row',
    table_row: {
      cells: [
        [{ type: 'text', text: { content: f.severity } }],
        [{ type: 'text', text: { content: f.check_name } }],
        [{ type: 'text', text: { content: f.function_name } }],
        [{ type: 'text', text: { content: String(f.line) } }],
        [{ type: 'text', text: { content: f.description } }],
      ],
    },
  }))

  const children =
    findings.length > 0
      ? [
          {
            object: 'block',
            type: 'table',
            table: {
              table_width: 5,
              has_column_header: true,
              has_row_header: false,
              children: [headerRow, ...rows],
            },
          },
        ]
      : [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: 'No findings detected.' } }] },
          },
        ]

  const body = {
    parent: { database_id: databaseId },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: title } }],
      },
    },
    children,
  }

  const res = await fetchWithRetry(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
    retryPolicy: NOTIFICATION_RETRY_POLICY,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message ?? `Notion API error ${res.status}`)
  }

  const data = await res.json()
  return (data as any).url as string
}
