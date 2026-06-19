'use client'

import { useState, useEffect } from 'react'

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isSafari, setIsSafari] = useState(false)

  useEffect(() => {
    // Check if running in standalone mode (already installed & opened as PWA)
    const checkStandalone = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
        || (navigator as any).standalone 
        || document.referrer.includes('android-app://')
      setIsInstalled(isStandalone)
    }

    checkStandalone()

    // Detect iOS
    const ua = window.navigator.userAgent
    const isIosDevice = /iPad|iPhone|iPod/.test(ua)
    setIsIOS(isIosDevice)

    // Detect Safari (but not Chrome/Firefox/etc on iOS)
    const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua)
    setIsSafari(isSafariBrowser)

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setIsInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setDeferredPrompt(null)
      localStorage.setItem('pwa-installed', 'true')
    }

    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    try {
      const { outcome } = await deferredPrompt.userChoice
      console.log(`PWA install prompt outcome: ${outcome}`)
      if (outcome === 'accepted') {
        setIsInstalled(true)
        setIsInstallable(false)
        setDeferredPrompt(null)
        localStorage.setItem('pwa-installed', 'true')
      }
    } catch (err) {
      console.error('PWA installation error:', err)
    }
  }

  return {
    isInstallable,
    isInstalled,
    isIOS,
    isSafari,
    install
  }
}
