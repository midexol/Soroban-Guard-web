'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'sg_tour_seen'

export type TourPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  id: string
  title: string
  content: string
  position?: TourPosition
}

export interface UseOnboardingTourReturn {
  active: boolean
  step: number
  total: number
  currentStep: TourStep | null
  next: () => void
  prev: () => void
  skip: () => void
  start: () => void
  targetRect: DOMRect | null
}

function getRect(id: string): DOMRect | null {
  const el = document.querySelector(`[data-tour-id="${id}"]`)
  return el ? el.getBoundingClientRect() : null
}

export function useOnboardingTour(steps: TourStep[]): UseOnboardingTourReturn {
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  const currentStep = active && steps[step] ? steps[step] : null

  const refreshRect = useCallback(() => {
    if (!currentStep) { setTargetRect(null); return }
    setTargetRect(getRect(currentStep.id))
  }, [currentStep])

  useEffect(() => {
    if (!active) return
    refreshRect()
    window.addEventListener('resize', refreshRect)
    window.addEventListener('scroll', refreshRect, { passive: true })
    return () => {
      window.removeEventListener('resize', refreshRect)
      window.removeEventListener('scroll', refreshRect)
    }
  }, [active, refreshRect])

  // Auto-start on first visit
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!localStorage.getItem(STORAGE_KEY)) {
      setActive(true)
    }
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    localStorage.setItem(STORAGE_KEY, '1')
    setTargetRect(null)
  }, [])

  const next = useCallback(() => {
    if (step < steps.length - 1) {
      setStep(s => s + 1)
    } else {
      finish()
    }
  }, [step, steps.length, finish])

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1)
  }, [step])

  const skip = useCallback(() => finish(), [finish])

  const start = useCallback(() => {
    setStep(0)
    setActive(true)
  }, [])

  return {
    active,
    step,
    total: steps.length,
    currentStep,
    next,
    prev,
    skip,
    start,
    targetRect,
  }
}
