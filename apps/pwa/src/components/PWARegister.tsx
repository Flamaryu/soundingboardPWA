'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'development') {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          let hasUnregistered = false
          const unregisterPromises = registrations.map((r) => 
            r.unregister().then((success) => {
              if (success) {
                console.log('Unregistered service worker in development mode:', r.scope)
                hasUnregistered = true
              }
            })
          )
          Promise.all(unregisterPromises).then(() => {
            if (hasUnregistered) {
              const reloadKey = 'sw_unregistered_reload'
              if (!sessionStorage.getItem(reloadKey)) {
                sessionStorage.setItem(reloadKey, 'true')
                console.log('Service workers unregistered. Reloading to clear interceptors...')
                window.location.reload()
              } else {
                console.log('Service workers unregistered but reload already performed. Skipping reload.')
              }
            } else {
              console.log('Skipping PWA Service Worker registration in development mode.')
            }
          })
        })
        return
      }

      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('PWA Service Worker registered with scope: ', registration.scope)
          })
          .catch((err) => {
            console.error('PWA Service Worker registration failed: ', err)
          })
      })
    }
  }, [])

  return null
}

