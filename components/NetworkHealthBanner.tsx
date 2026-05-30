'use client'

import { useEffect, useState } from 'react'

interface Props {
  network: string
  onDismiss: () => void
  checkHealth: () => Promise<boolean>
}

export default function NetworkHealthBanner({ network, onDismiss, checkHealth }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const id = setInterval(async () => {
      const healthy = await checkHealth()
      if (healthy) {
        setVisible(false)
        onDismiss()
      }
    }, 60_000)
    return () => clearInterval(id)
  }, [checkHealth, onDismiss])

  function handleDismiss() {
    setVisible(false)
    onDismiss()
  }

  if (!visible) return null

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Stellar {network} RPC is currently unreachable
            </p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
              Contract ID scanning may fail. Please try again later.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          aria-label="Dismiss"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
