'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { loginAction } from '../actions'

export default function LoginPage() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (token.length !== 6 || !/^\d+$/.test(token)) {
      setError('Please enter a valid 6-digit verification code.')
      return
    }

    startTransition(async () => {
      try {
        const result = await loginAction(token)
        if (result.success) {
          router.push('/')
          router.refresh()
        } else {
          setError(result.error || 'Invalid code.')
        }
      } catch (err: any) {
        setError('Network error or server unavailable.')
      }
    })
  }

  return (
    <main className="min-h-screen bg-[#0b132b] flex items-center justify-center px-4 font-sans text-slate-200">
      <div className="w-full max-w-md bg-[#1c2541]/85 border border-slate-800/80 backdrop-blur-md p-8 rounded-3xl shadow-2xl flex flex-col items-center">
        
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-[#00f5d4]/10 border border-[#00f5d4]/30 flex items-center justify-center text-white mb-6 shadow-lg shadow-[#00f5d4]/5 animate-pulse">
          <ShieldCheck className="w-8 h-8 text-[#00f5d4]" />
        </div>

        {/* Text */}
        <h1 className="text-xl font-black tracking-wider text-white uppercase mb-2">
          Echogram Admin Gate
        </h1>
        <p className="text-xs text-slate-400 text-center mb-6">
          Enter your 6-digit Proton Authenticator verification token to unlock the admin dashboard.
        </p>

        {/* Form */}
        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="0 0 0 0 0 0"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-[#0b132b] border border-slate-750 rounded-xl px-4 py-3.5 text-xl text-center text-white focus:outline-none focus:border-[#00f5d4] tracking-[0.75em] placeholder:tracking-normal placeholder:text-sm font-mono placeholder:text-slate-600 transition-all"
              disabled={isPending}
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 font-medium text-center bg-red-950/25 border border-red-500/20 py-2.5 rounded-xl animate-fadeIn">
              ⚠️ {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 bg-[#00f5d4] hover:bg-[#02b199] text-[#0b132b] font-bold rounded-xl transition-all active:scale-98 shadow-md shadow-[#00f5d4]/10 flex items-center justify-center gap-2 text-xs cursor-pointer disabled:bg-slate-800 disabled:text-slate-500"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying Credentials...
              </>
            ) : (
              'Verify & Unlock Dashboard'
            )}
          </button>
        </form>

        <span className="text-[10px] text-slate-600 font-mono mt-8 uppercase tracking-widest">
          Secure Workspace Session: 2 hours
        </span>
      </div>
    </main>
  )
}
