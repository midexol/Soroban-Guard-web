'use client'

import { useEffect, useState } from 'react'
import { NETWORKS, type StellarNetwork } from '@/types/stellar'

const STORAGE_KEY = 'sg_selected_network'

interface Props {
  value: StellarNetwork
  onChange: (network: StellarNetwork) => void
}

export function getStoredNetwork(): StellarNetwork {
  if (typeof window === 'undefined') return NETWORKS.mainnet
  const stored = localStorage.getItem(STORAGE_KEY)
  return (stored && NETWORKS[stored]) ? NETWORKS[stored] : NETWORKS.mainnet
}

export default function NetworkSelector({ value, onChange }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const key = e.target.value
    const network = NETWORKS[key]
    if (!network) return
    localStorage.setItem(STORAGE_KEY, key)
    onChange(network)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="network-selector" className="text-xs text-slate-400">
        Network
      </label>
      <select
        id="network-selector"
        value={value.name}
        onChange={handleChange}
        className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-slate-300 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
      >
        <option value="mainnet">Mainnet</option>
        <option value="testnet">Testnet</option>
        <option value="futurenet">Futurenet</option>
      </select>
    </div>
  )
}
