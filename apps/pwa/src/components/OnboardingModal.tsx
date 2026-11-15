'use client'

import { useState } from 'react'
import { Shield, Radio, Flame, ChevronRight, ChevronLeft, Check, Compass } from 'lucide-react'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  if (!isOpen) return null

  const slides = [
    {
      icon: Shield,
      title: "Strict Privacy Architecture",
      color: "text-[#00f5d4]",
      bgColor: "bg-[#00f5d4]/10",
      borderColor: "border-[#00f5d4]/30",
      content: "Physical location coordinates are utilized strictly to compute proximity streams on the fly in temporary cache memory. History paths, exact movements, and tracking logs are never saved, stored, or tracked."
    },
    {
      icon: Radio,
      title: "The Echo Mechanic",
      color: "text-amber-400",
      bgColor: "bg-amber-400/10",
      borderColor: "border-amber-400/30",
      content: "All messages launch in a hyper-local 300m walking radius. As neighbors engage, echo waves ripple and expand organically into broad neighborhood grids and city-wide council feeds."
    },
    {
      icon: Flame,
      title: "Citizens vs Beacons",
      color: "text-purple-400",
      bgColor: "bg-purple-400/10",
      borderColor: "border-purple-400/30",
      content: "Standard posts are free, anonymous location pins for local news and discourse. High-visibility 'Beacons' are reserved for real-world civic organizations, events, or brick-and-mortar storefronts."
    }
  ]

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1)
    } else {
      onClose()
    }
  }

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1)
    }
  }

  const ActiveIcon = slides[currentSlide].icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-[#1c2541] border border-slate-700/60 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Background gradient accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00f5d4]/10 rounded-full blur-3xl pointer-events-none" />
        
        {/* Header indicator */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#00f5d4] animate-spin-slow" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Welcome to Echogram</span>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {currentSlide + 1} of {slides.length}
          </span>
        </div>

        {/* Slide Content */}
        <div className="min-h-[220px] flex flex-col items-center text-center justify-center py-4">
          <div className={`p-4 rounded-2xl ${slides[currentSlide].bgColor} ${slides[currentSlide].borderColor} border mb-5`}>
            <ActiveIcon className={`w-10 h-10 ${slides[currentSlide].color}`} />
          </div>

          <h2 className="text-xl font-black text-white mb-3">
            {slides[currentSlide].title}
          </h2>

          <p className="text-xs text-slate-300 leading-relaxed px-2">
            {slides[currentSlide].content}
          </p>
        </div>

        {/* Indicators and Controls */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
          <div className="flex gap-1.5">
            {slides.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === currentSlide ? 'w-6 bg-[#00f5d4]' : 'w-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {currentSlide > 0 && (
              <button
                onClick={prevSlide}
                className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                aria-label="Previous Slide"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={nextSlide}
              className="px-5 py-2.5 rounded-xl bg-[#00f5d4] text-[#0b132b] font-bold text-xs flex items-center gap-1.5 hover:bg-[#00f5d4]/90 transition-colors cursor-pointer shadow-lg shadow-[#00f5d4]/20"
            >
              <span>{currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}</span>
              {currentSlide === slides.length - 1 ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
