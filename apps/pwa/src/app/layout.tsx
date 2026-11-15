import type { Metadata } from 'next'
import { Outfit, Inter } from 'next/font/google'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import { Analytics } from '@vercel/analytics/react'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['500', '600', '700', '800'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Echogram — Hyper-Local Civic Sounding Board',
  description: 'Privacy-first neighborhood bulletin board, civic proposals, and proximity-driven local feed.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Echogram',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('echogram_theme');
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = saved || (prefersDark ? 'dark' : 'light');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full bg-bg-main text-text-main font-sans antialiased flex flex-col">
        <PWARegister />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
