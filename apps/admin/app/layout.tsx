import './globals.css'

export const metadata = {
  title: 'Echogram Admin',
  description: 'Admin and Development tools for Echogram',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body className="min-h-full font-sans antialiased flex flex-col">
        {children}
      </body>
    </html>
  )
}
