import type { Metadata } from 'next'
import { Outfit, Inter } from 'next/font/google'
import './globals.css'
import PWARegister from '@/components/PWARegister'
import { Analytics } from '@vercel/analytics/next'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700', '800']
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700']
})

export const metadata: Metadata = {
  title: 'Wilmington Community Sounding Board',
  description: 'Hyper-local community board and billboard feed for Wilmington, Delaware planning districts.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SoundingBoard'
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable} h-full antialiased dark`} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.classList.add('dark');
                  localStorage.setItem('theme', 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full bg-bg-main text-text-main font-sans antialiased flex flex-col transition-colors duration-300">
        <PWARegister />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
