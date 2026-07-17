import { createNotionPage } from '@/lib/notion'
import type { Finding } from '@/types/findings'

const findings: Finding[] = [
  {
    check_name: 'unchecked-auth',
    severity: 'Critical',
    file_path: 'src/lib.rs',
    line: 42,
    function_name: 'transfer',
    description: 'Authorization is not verified before executing privileged operation.',
  },
  {
    check_name: 'integer-overflow',
    severity: 'Medium',
    file_path: 'src/lib.rs',
    line: 85,
    function_name: 'add_balance',
    description: 'Integer arithmetic may overflow without bounds checking.',
  },
]

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.resetAllMocks()
})

describe('createNotionPage', () => {
  it('returns the page url on success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://notion.so/page-abc123' }),
    } as unknown as Response)

    const url = await createNotionPage('secret_token', 'db-id', findings)
    expect(url).toBe('https://notion.so/page-abc123')
  })

  it('calls Notion pages endpoint with bearer auth', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://notion.so/page' }),
    } as unknown as Response)

    await createNotionPage('secret_token', 'db-id', findings)

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.notion.com/v1/pages')
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer secret_token',
      'Notion-Version': '2022-06-28',
    })
  })

  it('sends table block when findings are present', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://notion.so/page' }),
    } as unknown as Response)

    await createNotionPage('token', 'db-id', findings)
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.children[0].type).toBe('table')
    expect(body.children[0].table.has_column_header).toBe(true)
    expect(body.children[0].table.table_width).toBe(5)
    // header + 2 data rows
    expect(body.children[0].table.children).toHaveLength(3)
  })

  it('sends paragraph block when findings are empty', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://notion.so/page' }),
    } as unknown as Response)

    await createNotionPage('token', 'db-id', [])
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.children[0].type).toBe('paragraph')
    expect(body.children[0].paragraph.rich_text[0].text.content).toBe('No findings detected.')
  })

  it('sets database_id in parent', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://notion.so/page' }),
    } as unknown as Response)

    await createNotionPage('token', 'my-db-id', findings)
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(body.parent.database_id).toBe('my-db-id')
  })

  it('throws on non-ok response with message', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Unauthorized token' }),
    } as unknown as Response)

    await expect(createNotionPage('bad_token', 'db-id', findings)).rejects.toThrow(
      'Unauthorized token',
    )
  })

  it('throws generic error when no message in response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response)

    await expect(createNotionPage('token', 'db-id', findings)).rejects.toThrow(
      'Notion API error 500',
    )
  })
})
