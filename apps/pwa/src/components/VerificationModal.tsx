'use client'

import { useState } from 'react'
import { Building2, X, CheckCircle2, AlertCircle, Send } from 'lucide-react'

interface VerificationModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function VerificationModal({ isOpen, onClose }: VerificationModalProps) {
  const [orgName, setOrgName] = useState('')
  const [orgType, setOrgType] = useState<'business' | 'nonprofit' | 'political'>('business')
  const [contactEmail, setContactEmail] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!orgName.trim() || !contactEmail.trim()) {
      setError('Please provide organization name and contact email.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName: orgName.trim(),
          organizationType: orgType,
          contactEmail: contactEmail.trim(),
          details: details.trim()
        })
      })

      if (res.ok) {
        setSuccess(true)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to submit application. Please try again.')
      }
    } catch (err) {
      setError('Network error submitting application.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#1c2541] border border-slate-700/60 rounded-3xl p-6 shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50 hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-2xl">
            <Building2 className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">Commercial Verification Intake</h2>
            <p className="text-xs text-slate-400">Apply for Verified Business, Non-Profit, or Civic Account</p>
          </div>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[#00f5d4] mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-white">Application Submitted!</h3>
            <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
              Your commercial intake verification request has been logged in Neon DB. Our civic verification team will review your credentials shortly.
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2.5 rounded-xl bg-[#00f5d4] text-[#0b132b] font-bold text-xs cursor-pointer"
            >
              Back to App
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Organization / Entity Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Trolley Square Market or Riverfront Corp"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Organization Type</label>
              <select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
              >
                <option value="business">Commercial / Local Business</option>
                <option value="nonprofit">Non-Profit Organization</option>
                <option value="political">Civic / Political Representative</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Email</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="contact@org.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Verification Details / Address / License</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Provide physical store address, tax ID, or official website link for rapid verification..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-3 rounded-xl bg-[#00f5d4] text-[#0b132b] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#00f5d4]/90 transition-colors cursor-pointer shadow-lg shadow-[#00f5d4]/20 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Submitting Application...' : 'Submit Verification Intake'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
