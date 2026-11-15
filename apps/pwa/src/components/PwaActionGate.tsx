'use client'

import { useState, useEffect } from 'react'
import { usePWAInstall } from '@/hooks/usePWAInstall'

export default function PwaActionGate() {
  const { isInstallable, isInstalled, isIOS, isSafari, install } = usePWAInstall()
  const [isStandalone, setIsStandalone] = useState(false)
  const [hasInstalledApp, setHasInstalledApp] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check if already running inside the standalone PWA shell
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    setIsStandalone(standalone)

    // Check if PWA is installed on device via getInstalledRelatedApps
    const checkInstalled = async () => {
      try {
        if ('getInstalledRelatedApps' in navigator) {
          const apps = await (navigator as any).getInstalledRelatedApps()
          if (apps && apps.length > 0) {
            setHasInstalledApp(true)
          }
        }
      } catch {
        // API not available or failed — fall through
      }
      setChecked(true)
    }

    checkInstalled()
  }, [])

  // Suppress all UI if running inside standalone shell
  if (isStandalone || isInstalled) return null

  // Wait for async checks before rendering
  if (!checked) return null

  // ── MORPH 1: Installed locally → "Launch App" glowing link ──
  if (hasInstalledApp) {
    return (
      <div className="w-full flex justify-center" id="pwa-action-gate-launch">
        <a
          href="/?mode=standalone"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-[#0b132b] bg-[#00f5d4] transition-all duration-300 hover:scale-105 active:scale-95 glow-button"
        >
          <span className="text-lg group-hover:animate-bounce">🚀</span>
          <span>Launch App</span>
        </a>
      </div>
    )
  }

  // ── MORPH 2: Installable (Android/Windows/Mac) → "Install App" button ──
  if (isInstallable) {
    return (
      <div className="w-full flex justify-center" id="pwa-action-gate-install">
        <button
          onClick={install}
          className="group relative inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white border-2 border-[#00f5d4]/40 bg-[#00f5d4]/10 backdrop-blur-sm transition-all duration-300 hover:bg-[#00f5d4]/20 hover:border-[#00f5d4]/60 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span className="text-lg">➕</span>
          <span>Install App</span>
        </button>
      </div>
    )
  }

  // ── MORPH 3: iOS Safari → Helper card with share instructions ──
  if (isIOS && isSafari) {
    return (
      <div
        className="w-full max-w-sm mx-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 text-center space-y-2"
        id="pwa-action-gate-ios"
      >
        <p className="text-xs font-bold text-[#00f5d4] uppercase tracking-widest">
          Install on iPhone
        </p>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Tap the Safari{' '}
          <span className="inline-block text-white font-bold">
            Share arrow{' '}
            <svg className="inline w-3.5 h-3.5 -mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </span>
          , then select{' '}
          <strong className="text-[#00f5d4]">&ldquo;Add to Home Screen&rdquo;</strong> to launch.
        </p>
      </div>
    )
  }

  // No applicable state — render nothing
  return null
}
