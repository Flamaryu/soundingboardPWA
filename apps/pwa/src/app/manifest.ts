import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Echogram',
    short_name: 'Echogram',
    description: 'Hyper-local community board and feedback feed for Wilmington Delaware Planning Districts.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090d16', // Dark rich space background
    theme_color: '#0ea5e9', // Vibrant light blue accent color
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }
    ]
  }
}
