import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import ReportPage from './page'
import type { Finding } from '@/types/findings'

const mockGet = jest.fn()
const mockSearchParams = { get: mockGet }

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

// suppress window.print
beforeAll(() => { window.print = jest.fn() })

const finding: Finding = {
  check_name: 'unchecked-auth',
  severity: 'High',
  file_path: 'src/lib.rs',
  line: 42,
  function_name: 'transfer',
  description: 'Authorization not verified.',
}

function encodeFindings(findings: Finding[]) {
  return btoa(JSON.stringify(findings))
}

describe('ReportPage', () => {
  it('renders findings from URL params', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'f') return encodeFindings([finding])
      if (key === 'source') return 'my-contract'
      if (key === 'scannedAt') return '2024-01-01T00:00:00.000Z'
      if (key === 'score') return '75'
      return null
    })

    render(<ReportPage />)

    expect(screen.getByText('unchecked-auth')).toBeInTheDocument()
    expect(screen.getByText(/transfer/)).toBeInTheDocument()
    expect(screen.getByText(/src\/lib\.rs/)).toBeInTheDocument()
    expect(screen.getByText('Authorization not verified.')).toBeInTheDocument()
    expect(screen.getByText(/my-contract/)).toBeInTheDocument()
    expect(screen.getByText(/Security Score: 75/)).toBeInTheDocument()
  })

  it('shows "No findings detected." when findings list is empty', () => {
    mockGet.mockImplementation((key: string) => {
      if (key === 'f') return encodeFindings([])
      if (key === 'source') return 'clean-contract'
      return null
    })

    render(<ReportPage />)

    expect(screen.getByText('No findings detected.')).toBeInTheDocument()
  })

  it('renders severity counts in summary', () => {
    const findings: Finding[] = [
      { ...finding, severity: 'High' },
      { ...finding, severity: 'Medium', check_name: 'missing-auth' },
    ]
    mockGet.mockImplementation((key: string) => {
      if (key === 'f') return encodeFindings(findings)
      if (key === 'source') return 'test'
      return null
    })

    render(<ReportPage />)

    // Summary cards: Critical=0, High=1, Medium=1, Low=0
    const values = screen.getAllByText('1')
    expect(values.length).toBeGreaterThanOrEqual(2)
  })

  it('handles missing f param gracefully', () => {
    mockGet.mockReturnValue(null)
    render(<ReportPage />)
    expect(screen.getByText('No findings detected.')).toBeInTheDocument()
  })
})
