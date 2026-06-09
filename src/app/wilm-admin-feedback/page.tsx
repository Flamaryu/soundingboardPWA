'use client'

import { useState, useTransition } from 'react'
import { fetchFeedbackAction, clearSandboxFeedAction } from './actions'
import { Lock, FileText, Calendar, ArrowLeft, RefreshCw, Trash2 } from 'lucide-react'

export default function AdminFeedbackPage() {
  const [password, setPassword] = useState('')
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isUnlocked, setIsUnlocked] = useState(false)

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const data = await fetchFeedbackAction(password)
        setFeedbacks(data)
        setIsUnlocked(true)
      } catch (err: any) {
        setError('Invalid admin password. Access denied.')
      }
    })
  }

  const handleRefresh = () => {
    setError('')
    startTransition(async () => {
      try {
        const data = await fetchFeedbackAction(password)
        setFeedbacks(data)
      } catch (err: any) {
        setError('Session expired or password invalid.')
        setIsUnlocked(false)
      }
    })
  }

  // Sandbox clear states
  const [sandboxMsg, setSandboxMsg] = useState('')
  const [sandboxError, setSandboxError] = useState('')
  const [clearingSandbox, setClearingSandbox] = useState(false)

  const handleClearSandbox = async () => {
    if (!confirm('Are you sure you want to completely clear the Vercel KV Sandbox Feed? This cannot be undone.')) return
    setClearingSandbox(true)
    setSandboxMsg('')
    setSandboxError('')
    try {
      await clearSandboxFeedAction(password)
      setSandboxMsg('Sandbox feed successfully cleared from Vercel KV!')
      setTimeout(() => setSandboxMsg(''), 5000)
    } catch (err: any) {
      setSandboxError(err?.message || 'Failed to clear sandbox feed. Check Vercel KV connection settings.')
      setTimeout(() => setSandboxError(''), 5000)
    } finally {
      setClearingSandbox(false)
    }
  }

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-[#0b132b] flex items-center justify-center px-4 font-sans">
        <div className="w-full max-w-md bg-[#1c2541]/85 border border-slate-700/50 backdrop-blur-md p-8 rounded-3xl shadow-2xl flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-[#d90429]/10 border border-[#d90429]/30 flex items-center justify-center text-white mb-6">
            <Lock className="w-6 h-6 text-[#d90429]" />
          </div>
          <h1 className="text-lg font-black tracking-wider text-white uppercase mb-2">Admin Access</h1>
          <p className="text-xs text-slate-400 text-center mb-6">
            Enter the beta program password to view user feedback logs.
          </p>

          <form onSubmit={handleUnlock} className="w-full flex flex-col gap-4">
            <input
              type="password"
              placeholder="Enter password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#0b132b] border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#d90429] tracking-widest text-center placeholder:tracking-normal placeholder:text-sm"
              disabled={isPending}
            />
            {error && (
              <p className="text-xs text-red-400 font-medium text-center bg-red-950/20 border border-red-500/10 py-2 rounded-xl">
                ⚠️ {error}
              </p>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 bg-[#d90429] hover:bg-[#b00320] text-white font-bold rounded-xl transition-all active:scale-98 shadow-md shadow-[#d90429]/15 flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              {isPending ? 'Verifying...' : 'Unlock Logs'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0b132b] px-4 py-8 md:px-8 font-sans">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <a 
              href="/"
              className="p-2 bg-[#1c2541] hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white border border-slate-700/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div>
              <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
                Beta Feedback Logs
              </h1>
              <p className="text-xs text-[#00f5d4] font-semibold tracking-wide">
                Wilmington Sounding Board PWA Live Preview
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isPending}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/50 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleClearSandbox}
              disabled={clearingSandbox}
              className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/35 text-amber-400 border border-amber-500/20 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {clearingSandbox ? 'Clearing...' : 'Clear Sandbox'}
            </button>
            <button
              onClick={() => {
                setIsUnlocked(false)
                setPassword('')
                setFeedbacks([])
              }}
              className="px-3 py-1.5 bg-[#d90429]/15 border border-[#d90429]/30 text-[#d90429] hover:bg-[#d90429]/25 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Lock
            </button>
          </div>
        </div>

        {/* Sandbox Feed Messages */}
        {sandboxMsg && (
          <div className="text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-500/10 px-4 py-3 rounded-xl font-bold animate-fadeIn">
            ✨ {sandboxMsg}
          </div>
        )}
        {sandboxError && (
          <div className="text-xs text-red-400 bg-red-950/20 border border-red-500/10 px-4 py-3 rounded-xl font-medium animate-fadeIn">
            ⚠️ {sandboxError}
          </div>
        )}

        {feedbacks.length === 0 ? (
          <div className="text-center py-16 bg-[#1c2541]/30 border border-slate-800 rounded-3xl p-8">
            <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-sm font-bold text-white">No feedback logged yet</h3>
            <p className="text-xs text-slate-400 mt-1.5">When users scan the sticker QR code and submit comments, they will appear here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-slate-400 font-bold px-1">
              Showing {feedbacks.length} response{feedbacks.length !== 1 ? 's' : ''} (sorted by newest first)
            </p>
            <div className="grid gap-3.5 animate-fadeIn">
              {feedbacks.map((item, idx) => (
                <div 
                  key={item.id || idx} 
                  className="bg-[#1c2541]/75 border border-slate-700/40 p-5 rounded-2xl flex flex-col gap-3 hover:border-slate-600/60 transition-all shadow-md"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/40 pb-2.5">
                    <span className="text-[10px] font-black uppercase text-[#00f5d4] bg-[#00f5d4]/10 border border-[#00f5d4]/20 px-2.5 py-0.5 rounded-md">
                      Feedback #{feedbacks.length - idx}
                    </span>
                    <span className="text-[9px] text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-medium">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
