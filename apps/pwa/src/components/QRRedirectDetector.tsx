'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

interface QRRedirectDetectorProps {
  onDetect: (detected: boolean) => void
}

export default function QRRedirectDetector({ onDetect }: QRRedirectDetectorProps) {
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!searchParams) return
    const source = searchParams.get('source')
    const ref = searchParams.get('ref')
    
    if (source === 'sticker' || ref === 'qr') {
      onDetect(true)
      
      // Silently strip parameter from URL bar
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.delete('source')
        url.searchParams.delete('ref')
        const newUrlPath = url.pathname + url.search
        window.history.replaceState({}, '', newUrlPath)
      }
    }
  }, [searchParams, onDetect])

  return null
}
