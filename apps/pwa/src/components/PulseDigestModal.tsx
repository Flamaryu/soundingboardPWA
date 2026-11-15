'use client'

import { useEffect, useState } from 'react'
import { X, Sparkles, CheckCircle2, AlertTriangle, Bell } from 'lucide-react'
import type { PulseDigest } from '@/lib/types'

interface PulseDigestModalProps {
  isOpen: boolean
  onClose: () => void
  neighborhoodId: number
  onSelectPost: (postId: string) => void
}

export default function PulseDigestModal({
  isOpen,
  onClose,
  neighborhoodId,
  onSelectPost,
}: PulseDigestModalProps) {
  const [digest, setDigest] = useState<PulseDigest | null>(null)
  const [loading, setLoading] = useState(false)
  const [alertsEnabled, setAlertsEnabled] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch(`/api/digest?neighborhoodId=${neighborhoodId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDigest(data.digest)
      })
      .finally(() => setLoading(false))

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setAlertsEnabled(Notification.permission === 'granted')
    }
  }, [isOpen, neighborhoodId])

  if (!isOpen) return null

  const handleEnableAlerts = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setAlertsEnabled(perm === 'granted')
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full sm:max-w-lg bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-display text-base font-bold">Local Pulse Digest</h3>
              <p className="text-xs text-text-muted">{digest?.scopeName || 'Neighborhood Summary'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-subtle text-text-muted hover:text-text-main cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Proximity Alert Opt-in */}
        <div className="p-3.5 rounded-2xl bg-surface-subtle border border-border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-accent-main shrink-0" />
            <div className="text-xs">
              <div className="font-bold">Proximity Safety Alerts</div>
              <div className="text-text-muted">Notify when urgent alerts or proposals break out nearby.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleEnableAlerts}
            className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 cursor-pointer ${
              alertsEnabled
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-accent-main text-white'
            }`}
          >
            {alertsEnabled ? 'Enabled' : 'Enable'}
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-text-muted">Compiling neighborhood pulse...</div>
        ) : digest ? (
          <div className="space-y-4 text-xs">
            {digest.activeAlerts.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold uppercase tracking-wider text-accent-main flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Active Safety Alerts
                </h4>
                {digest.activeAlerts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      onSelectPost(a.id)
                      onClose()
                    }}
                    className="w-full text-left p-3 rounded-xl bg-surface-subtle border border-border-subtle hover:border-accent-main/50 cursor-pointer"
                  >
                    <div className="font-bold text-sm">{a.title}</div>
                    <div className="text-text-muted mt-0.5 line-clamp-2">{a.content}</div>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Top Civic Proposals
              </h4>
              {digest.topProposals.length === 0 ? (
                <p className="text-text-muted">No active proposals in this area yet.</p>
              ) : (
                digest.topProposals.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onSelectPost(p.id)
                      onClose()
                    }}
                    className="w-full text-left p-3 rounded-xl bg-surface-subtle border border-border-subtle hover:border-emerald-500/50 cursor-pointer"
                  >
                    <div className="font-bold text-sm">{p.title}</div>
                    <div className="text-text-muted mt-1">
                      {p.agreeVotes} Agree · {p.objectVotes} Object · {p.radiusMeters}m reach
                    </div>
                  </button>
                ))
              )}
            </div>

            {digest.nearbyBeacons.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Nearby Beacons
                </h4>
                {digest.nearbyBeacons.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      onSelectPost(b.id)
                      onClose()
                    }}
                    className="w-full text-left p-3 rounded-xl bg-surface-subtle border border-border-subtle hover:border-amber-500/50 cursor-pointer"
                  >
                    <div className="font-bold text-sm">{b.title}</div>
                    <div className="text-text-muted mt-0.5">{b.authorName} · {b.neighborhoodName}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
