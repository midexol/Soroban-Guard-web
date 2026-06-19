'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TourPosition, TourStep } from '@/lib/useOnboardingTour'

interface Props {
  step: TourStep
  stepIndex: number
  total: number
  targetRect: DOMRect | null
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
}

const TOOLTIP_WIDTH = 300
const TOOLTIP_OFFSET = 12
const ARROW_SIZE = 8

function getTooltipStyle(
  rect: DOMRect | null,
  position: TourPosition,
): React.CSSProperties {
  if (!rect) {
    return {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: TOOLTIP_WIDTH,
      zIndex: 9999,
    }
  }

  const styles: React.CSSProperties = {
    position: 'fixed',
    width: TOOLTIP_WIDTH,
    zIndex: 9999,
  }

  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  switch (position) {
    case 'top':
      styles.left = Math.max(8, Math.min(window.innerWidth - TOOLTIP_WIDTH - 8, centerX - TOOLTIP_WIDTH / 2))
      styles.top = rect.top - TOOLTIP_OFFSET
      styles.transform = 'translateY(-100%)'
      break
    case 'bottom':
      styles.left = Math.max(8, Math.min(window.innerWidth - TOOLTIP_WIDTH - 8, centerX - TOOLTIP_WIDTH / 2))
      styles.top = rect.bottom + TOOLTIP_OFFSET
      break
    case 'left':
      styles.left = rect.left - TOOLTIP_OFFSET
      styles.top = centerY
      styles.transform = `translate(-100%, -50%)`
      break
    case 'right':
      styles.left = rect.right + TOOLTIP_OFFSET
      styles.top = centerY
      styles.transform = `translateY(-50%)`
      break
  }

  return styles
}

function getArrowStyle(position: TourPosition, rect: DOMRect | null): React.CSSProperties {
  if (!rect) return { display: 'none' }
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 0,
    height: 0,
  }
  switch (position) {
    case 'top':
      return {
        ...base,
        bottom: -ARROW_SIZE,
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderTop: `${ARROW_SIZE}px solid #312e81`,
      }
    case 'bottom':
      return {
        ...base,
        top: -ARROW_SIZE,
        left: '50%',
        transform: 'translateX(-50%)',
        borderLeft: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid #312e81`,
      }
    case 'left':
      return {
        ...base,
        right: -ARROW_SIZE,
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderLeft: `${ARROW_SIZE}px solid #312e81`,
      }
    case 'right':
      return {
        ...base,
        left: -ARROW_SIZE,
        top: '50%',
        transform: 'translateY(-50%)',
        borderTop: `${ARROW_SIZE}px solid transparent`,
        borderBottom: `${ARROW_SIZE}px solid transparent`,
        borderRight: `${ARROW_SIZE}px solid #312e81`,
      }
  }
}

export default function TourTooltip({
  step,
  stepIndex,
  total,
  targetRect,
  onNext,
  onPrev,
  onSkip,
}: Props) {
  const position = step.position ?? 'bottom'
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Move focus into the tooltip
  useEffect(() => {
    tooltipRef.current?.focus()
  }, [stepIndex])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onSkip()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onNext, onPrev, onSkip])

  const tooltipStyle = getTooltipStyle(targetRect, position)
  const arrowStyle = getArrowStyle(position, targetRect)

  const content = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/50"
        aria-hidden="true"
        onClick={onSkip}
      />

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            borderRadius: 10,
            boxShadow: '0 0 0 4px rgba(99,102,241,0.7)',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip box */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${stepIndex + 1} of ${total}: ${step.title}`}
        tabIndex={-1}
        style={tooltipStyle}
        className="rounded-xl border border-indigo-700/60 bg-indigo-950 p-4 shadow-2xl outline-none"
      >
        <div style={arrowStyle} />

        {/* Progress dots */}
        <div className="mb-3 flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? 'w-4 bg-indigo-400' : 'w-1.5 bg-indigo-800'
              }`}
            />
          ))}
          <span className="ml-auto text-xs text-indigo-400">
            {stepIndex + 1} / {total}
          </span>
        </div>

        <h3 className="mb-1.5 text-sm font-semibold text-white">{step.title}</h3>
        <p className="mb-4 text-xs leading-relaxed text-slate-300">{step.content}</p>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onSkip}
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                onClick={onPrev}
                className="rounded-lg border border-indigo-700/60 px-3 py-1.5 text-xs text-indigo-300 transition hover:border-indigo-500 hover:text-white"
              >
                ← Back
              </button>
            )}
            <button
              onClick={onNext}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              {stepIndex < total - 1 ? 'Next →' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
