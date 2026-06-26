'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PwaActionGate from '@/components/PwaActionGate'

// ═══════════════════════════════════════════════════════════════════
// SLIDE DATA
// ═══════════════════════════════════════════════════════════════════

const SLIDES = [
  {
    id: 'welcome',
    badge: 'PRE-ALPHA',
    title: 'You Just Found Something Early',
    paragraphs: [
      "Welcome to Echogram — a hyper-local communication network built from scratch for Wilmington, Delaware.",
      "You just scanned into the ground floor. This isn't a polished product launch. It's a living playground where catching bugs and providing raw feedback is the entire mission.",
      "Appreciate you being here this early."
    ],
    icon: '✦',
  },
  {
    id: 'proximity',
    badge: 'HOW IT WORKS',
    title: 'No Algorithms. Just Physics.',
    paragraphs: [
      "There's no corporate black-box deciding what you see. Posts expand and swell outward like localized sound waves from their exact origin point.",
      "If people interact with an update right at 7th & Orange, its visibility radius expands across the grid. If it fades, the circle naturally contracts.",
      "Proximity is the algorithm."
    ],
    icon: '◎',
  },
  {
    id: 'sandbox',
    badge: 'SANDBOX MODE',
    title: 'Everything Here Is a Stress Test',
    paragraphs: [
      "Coordinates, profiles, and post timelines are currently streaming through a highly optimized mock sandbox engine.",
      "We're battle-testing our spatial math before prime time. Every interaction you run here helps us calibrate the echo radius system for the real network.",
      "Ready to see it in action?"
    ],
    icon: '⬡',
  },
]

// ═══════════════════════════════════════════════════════════════════
// SLIDE VISUAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function WelcomeVisual() {
  return (
    <div className="relative w-32 h-32 mx-auto mb-8 flex items-center justify-center">
      {/* Ambient glow behind logo */}
      <div className="absolute inset-0 rounded-full bg-[#00f5d4]/10 blur-xl animate-pulse" />
      <img
        src="/icon-512.png"
        alt="Echogram"
        className="relative w-24 h-24 rounded-2xl shadow-[0_0_30px_rgba(0,245,212,0.2)]"
      />
    </div>
  )
}

function ProximityVisual() {
  return (
    <div className="relative w-40 h-40 mx-auto mb-8 flex items-center justify-center">
      {/* Animated ripple rings */}
      <div className="absolute w-36 h-36 rounded-full border border-[#00f5d4]/20 ripple-ring" />
      <div className="absolute w-28 h-28 rounded-full border border-[#00f5d4]/30 ripple-ring-delay-1" />
      <div className="absolute w-20 h-20 rounded-full border border-[#00f5d4]/40 ripple-ring-delay-2" />
      {/* Center post dot */}
      <div className="relative w-4 h-4 rounded-full bg-[#00f5d4] shadow-[0_0_20px_rgba(0,245,212,0.6)]" />
    </div>
  )
}

function SandboxVisual() {
  return (
    <div className="relative w-36 h-36 mx-auto mb-8">
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,245,212,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,245,212,0.06)_1px,transparent_1px)] bg-[size:12px_12px] rounded-xl border border-[#00f5d4]/15" />
      {/* Mock data points */}
      <div className="absolute top-4 left-6 w-2 h-2 rounded-full bg-[#00f5d4]/60 animate-pulse" />
      <div className="absolute top-10 right-8 w-1.5 h-1.5 rounded-full bg-[#00f5d4]/40 animate-pulse" style={{ animationDelay: '0.5s' }} />
      <div className="absolute bottom-8 left-10 w-2.5 h-2.5 rounded-full bg-[#00f5d4]/50 animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-5 right-6 w-1.5 h-1.5 rounded-full bg-[#00f5d4]/35 animate-pulse" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="text-3xl text-[#00f5d4]/70">⬡</span>
      </div>
    </div>
  )
}

const SLIDE_VISUALS = [WelcomeVisual, ProximityVisual, SandboxVisual]

// ═══════════════════════════════════════════════════════════════════
// MAIN STICKER ONBOARDING PAGE
// ═══════════════════════════════════════════════════════════════════

export default function StickerOnboarding() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isExiting, setIsExiting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Touch tracking
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchDeltaX = useRef(0)
  const isSwiping = useRef(false)

  const totalSlides = SLIDES.length

  const goToSlide = useCallback((index: number) => {
    if (index < 0 || index >= totalSlides) return
    setCurrentSlide(index)
  }, [totalSlides])

  const goNext = useCallback(() => {
    if (currentSlide < totalSlides - 1) {
      goToSlide(currentSlide + 1)
    }
  }, [currentSlide, totalSlides, goToSlide])

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1)
    }
  }, [currentSlide, goToSlide])

  // ── Enter the Grid CTA ──
  const handleEnterGrid = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      router.push('/')
    }, 400)
  }, [router])

  // ── Keyboard navigation ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'Enter' && currentSlide === totalSlides - 1) handleEnterGrid()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrev, currentSlide, totalSlides, handleEnterGrid])

  // ── Touch handlers ──
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchDeltaX.current = 0
    isSwiping.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current
    const deltaY = e.touches[0].clientY - touchStartY.current

    // Only register as horizontal swipe if horizontal movement exceeds vertical
    if (!isSwiping.current && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      isSwiping.current = true
    }

    if (isSwiping.current) {
      touchDeltaX.current = deltaX
    }
  }

  const handleTouchEnd = () => {
    if (!isSwiping.current) return

    const SWIPE_THRESHOLD = 50
    if (touchDeltaX.current < -SWIPE_THRESHOLD) {
      goNext()
    } else if (touchDeltaX.current > SWIPE_THRESHOLD) {
      goPrev()
    }

    touchDeltaX.current = 0
    isSwiping.current = false
  }

  return (
    <div
      className={`fixed inset-0 bg-[#0b132b] z-50 overflow-hidden flex flex-col transition-opacity duration-400 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* ── Ambient background layer ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-[#00f5d4]/[0.03] blur-[100px]" />
        <div className="absolute bottom-1/4 -right-32 w-80 h-80 rounded-full bg-[#00f5d4]/[0.02] blur-[80px]" />
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,245,212,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,245,212,0.015)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* ── Top bar ── */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-safe-top py-5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00f5d4] shadow-[0_0_8px_rgba(0,245,212,0.5)]" />
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#00f5d4]/80">
            Echogram
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/30">
          {currentSlide + 1}/{totalSlides}
        </span>
      </div>

      {/* ── Carousel viewport ── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {SLIDES.map((slide, index) => {
            const Visual = SLIDE_VISUALS[index]
            const isActive = index === currentSlide
            const isLastSlide = index === totalSlides - 1

            return (
              <div
                key={slide.id}
                className="w-full flex-shrink-0 h-full flex flex-col items-center justify-center px-8"
                aria-hidden={!isActive}
              >
                <div className={`max-w-md w-full text-center transition-all duration-500 ${
                  isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}>
                  {/* Slide visual */}
                  {isActive && <Visual />}

                  {/* Badge */}
                  <div className={`inline-block px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] mb-5 ${
                    isActive ? 'animate-fade-in-delay-1' : ''
                  } ${
                    slide.badge === 'PRE-ALPHA'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      : slide.badge === 'HOW IT WORKS'
                      ? 'border-[#00f5d4]/30 bg-[#00f5d4]/10 text-[#00f5d4]'
                      : 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                  }`}>
                    {slide.badge}
                  </div>

                  {/* Title */}
                  <h2 className={`text-2xl sm:text-3xl font-black text-white leading-tight mb-6 ${
                    isActive ? 'animate-fade-in-delay-2' : ''
                  }`}>
                    {slide.title}
                  </h2>

                  {/* Copy */}
                  <div className={`space-y-3 ${isActive ? 'animate-fade-in-delay-3' : ''}`}>
                    {slide.paragraphs.map((p, pIdx) => (
                      <p
                        key={pIdx}
                        className="text-sm text-slate-400 leading-relaxed"
                      >
                        {p}
                      </p>
                    ))}
                  </div>

                  {/* ── Slide 3 Footer: PwaActionGate + Enter the Grid CTA ── */}
                  {isLastSlide && isActive && (
                    <div className="mt-10 space-y-4 animate-fade-in-delay-3">
                      <PwaActionGate />

                      <button
                        onClick={handleEnterGrid}
                        className="group relative w-full max-w-xs mx-auto flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-[#0b132b] bg-[#00f5d4] hover:bg-[#00e1c2] transition-all duration-300 hover:scale-[1.03] active:scale-[0.97] cursor-pointer shadow-[0_0_30px_rgba(0,245,212,0.2)]"
                        id="enter-grid-cta"
                      >
                        <span>Enter the Grid</span>
                        <svg
                          className="w-4 h-4 transition-transform group-hover:translate-x-1"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Bottom navigation bar ── */}
      <div className="relative z-10 px-6 pb-safe-bottom py-6">
        <div className="flex items-center justify-between max-w-md mx-auto">
          {/* Prev button */}
          <button
            onClick={goPrev}
            disabled={currentSlide === 0}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
              currentSlide === 0
                ? 'opacity-0 pointer-events-none'
                : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
            }`}
            aria-label="Previous slide"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Dot indicators */}
          <div className="flex items-center gap-2">
            {SLIDES.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`onboarding-dot cursor-pointer ${
                  index === currentSlide ? 'onboarding-dot-active' : ''
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Next button */}
          <button
            onClick={currentSlide === totalSlides - 1 ? handleEnterGrid : goNext}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-[#00f5d4]/10 hover:bg-[#00f5d4]/20 text-[#00f5d4] transition-all duration-300 hover:scale-110 cursor-pointer"
            aria-label={currentSlide === totalSlides - 1 ? 'Enter the grid' : 'Next slide'}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
