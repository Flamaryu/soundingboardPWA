'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  User as UserIcon, 
  MapPin, 
  ShieldCheck, 
  Building2, 
  MessageSquare, 
  Heart, 
  Sparkles, 
  Compass, 
  Lock, 
  ArrowLeft,
  CheckCircle,
  Clock,
  LogOut,
  UserPlus,
  LogIn,
  KeyRound,
  Mail,
  AlertCircle,
  Save,
  Check
} from 'lucide-react'
import VerificationModal from '@/components/VerificationModal'
import OnboardingModal from '@/components/OnboardingModal'

interface ProfileClientProps {
  neighborhoods: any[]
}

export default function ProfileClient({ neighborhoods }: ProfileClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  
  // Form inputs
  const [emailInput, setEmailInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)

  // Profile data
  const [systemUsername, setSystemUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [homeNeighborhood, setHomeNeighborhood] = useState('')
  const [role, setRole] = useState('citizen')
  const [userPosts, setUserPosts] = useState<any[]>([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  
  // Editable profile states
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editNeighborhood, setEditNeighborhood] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('')

  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  const [selectedNh, setSelectedNh] = useState('')
  const [savingNh, setSavingNh] = useState(false)

  useEffect(() => {
    // Check if user is logged in as authenticated member
    const savedMember = localStorage.getItem('echogram_auth_member')
    if (savedMember) {
      try {
        const parsed = JSON.parse(savedMember)
        setIsAuthenticated(true)
        setSystemUsername(parsed.systemUsername || '')
        setDisplayName(parsed.displayName || parsed.systemUsername || '')
        setHomeNeighborhood(parsed.homeNeighborhood || '')
        setRole(parsed.role || 'citizen')
        setEditDisplayName(parsed.displayName || parsed.systemUsername || '')
        setEditNeighborhood(parsed.homeNeighborhood || '')
      } catch (e) {}
    }

    if (sessionStorage.getItem('echogram_onboarding_seen') !== 'true') {
      setShowOnboardingModal(true)
      sessionStorage.setItem('echogram_onboarding_seen', 'true')
    }

    fetchUserPosts()
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      setEditDisplayName(displayName)
      setEditNeighborhood(homeNeighborhood)
    }
  }, [isAuthenticated, displayName, homeNeighborhood])

  const fetchUserPosts = async () => {
    setLoadingPosts(true)
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('echogram_auth_member') : null
      if (saved) {
        const parsed = JSON.parse(saved)
        const authorTarget = parsed.id || parsed.systemUsername
        if (authorTarget) {
          const res = await fetch(`/api/posts/sandbox?authorId=${encodeURIComponent(authorTarget)}&viewMode=city&lat=39.745&lng=-75.550`)
          if (res.ok) {
            const data = await res.json()
            setUserPosts(data.posts || [])
            return
          }
        }
      }
      setUserPosts([])
    } catch (err) {
      console.error('Error fetching user posts:', err)
      setUserPosts([])
    } finally {
      setLoadingPosts(false)
    }
  }

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError('Please enter valid email and password credentials.')
      return
    }

    setAuthSubmitting(true)
    try {
      const endpoint = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), password: passwordInput.trim() })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setAuthError(data.error || 'Authentication failed. Please try again.')
        return
      }

      const user = data.user
      localStorage.setItem('echogram_auth_member', JSON.stringify(user))
      setIsAuthenticated(true)
      setSystemUsername(user.systemUsername)
      setDisplayName(user.displayName || user.systemUsername)
      setHomeNeighborhood(user.homeNeighborhood || '')
      setRole(user.role || 'citizen')
      setEditDisplayName(user.displayName || user.systemUsername)
      setEditNeighborhood(user.homeNeighborhood || '')

      fetchUserPosts()

      if (authMode === 'signup' || !user.homeNeighborhood) {
        router.push('/profile?onboarding=true')
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error. Please try again.')
    } finally {
      setAuthSubmitting(false)
    }
  }

  const handleSignOut = () => {
    localStorage.removeItem('echogram_auth_member')
    setIsAuthenticated(false)
    setSystemUsername('')
    setDisplayName('')
    setHomeNeighborhood('')
    router.push('/')
  }

  const handleSelectHomeNeighborhood = async (nhName: string) => {
    setSelectedNh(nhName)
    setSavingNh(true)
    try {
      const saved = JSON.parse(localStorage.getItem('echogram_auth_member') || '{}')
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: saved.id,
          systemUsername: saved.systemUsername,
          homeNeighborhood: nhName
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const updatedUser = data.user
        localStorage.setItem('echogram_auth_member', JSON.stringify(updatedUser))
        setHomeNeighborhood(updatedUser.homeNeighborhood)
        if (isOnboarding) {
          router.push('/')
        }
      }
    } catch (e) {
      console.error('Error selecting neighborhood:', e)
    } finally {
      setSavingNh(false)
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileSuccessMsg('')
    try {
      const saved = JSON.parse(localStorage.getItem('echogram_auth_member') || '{}')
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: saved.id,
          systemUsername: saved.systemUsername || systemUsername,
          displayName: editDisplayName.trim(),
          homeNeighborhood: editNeighborhood
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        const updatedUser = data.user
        localStorage.setItem('echogram_auth_member', JSON.stringify(updatedUser))
        setDisplayName(updatedUser.displayName)
        setHomeNeighborhood(updatedUser.homeNeighborhood)
        setProfileSuccessMsg('Profile settings saved successfully to Neon Postgres!')
        setTimeout(() => setProfileSuccessMsg(''), 4000)
      } else {
        alert(data.error || 'Failed to update profile.')
      }
    } catch (err: any) {
      alert('Error updating profile: ' + err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-white flex flex-col items-center p-4 md:p-8 relative">
      {/* Onboarding Dimmed Modal Layer */}
      {isOnboarding && isAuthenticated && !homeNeighborhood && (
        <div className="fixed inset-0 z-40 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#1c2541] border border-[#00f5d4]/40 rounded-3xl p-6 md:p-8 shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-[#00f5d4]/10 border border-[#00f5d4]/30 flex items-center justify-center mx-auto text-[#00f5d4]">
              <Lock className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">Select Your Permanent Home Layer</h2>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                To unlock full interactive map permissions, walking radar streams, and council feeds in Echogram Alpha, select your native Wilmington home neighborhood.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
              {neighborhoods.map((nh) => (
                <button
                  key={nh.id}
                  onClick={() => handleSelectHomeNeighborhood(nh.name)}
                  disabled={savingNh}
                  className={`p-3 rounded-2xl border text-xs font-bold transition-all text-left flex items-center gap-2 ${
                    selectedNh === nh.name || homeNeighborhood === nh.name
                      ? 'bg-[#00f5d4] text-[#0b132b] border-[#00f5d4]' 
                      : 'bg-[#0b132b] text-slate-200 border-slate-700 hover:border-[#00f5d4]/50'
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-[#00f5d4]" />
                  <span className="truncate">{nh.name}</span>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-slate-400">Neighborhood boundaries loaded live from Neon Postgres Spatial Database</p>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-3xl space-y-6">
        {/* Navigation Bar */}
        <div className="flex justify-between items-center bg-[#1c2541]/90 border border-slate-700/60 rounded-2xl p-4 backdrop-blur-md">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-[#00f5d4] transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Live Map</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#00f5d4]" />
              <span className="text-xs font-black uppercase tracking-wider text-[#00f5d4]">Echogram Portal</span>
            </div>

            {isAuthenticated && (
              <button
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold flex items-center gap-1.5 hover:bg-red-500/20 transition-colors cursor-pointer ml-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {/* Unauthenticated / Guest State: Sign Up / Log In Form Card */}
        {!isAuthenticated ? (
          <div className="bg-[#1c2541] border border-slate-700/70 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 animate-fadeIn">
            <div className="text-center space-y-2 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-3xl bg-[#00f5d4]/10 border border-[#00f5d4]/30 flex items-center justify-center mx-auto text-[#00f5d4] mb-3">
                <UserPlus className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-white">Join the Wilmington Echo Network</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                You are currently viewing Echogram as a Guest. Create an account to customize your profile, publish verified beacons, and anchor posts to your home neighborhood!
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex bg-[#0b132b] p-1 rounded-2xl max-w-sm mx-auto border border-slate-800">
              <button
                onClick={() => setAuthMode('signup')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-[#00f5d4] text-[#0b132b] shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>Create Account</span>
              </button>
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#00f5d4] text-[#0b132b] shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            </div>

            {/* Auth Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-4 max-w-md mx-auto pt-2">
              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#00f5d4]" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="citizen@wilmington.org"
                  className="w-full px-4 py-3 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#00f5d4]" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
                  required
                />
              </div>

              {authMode === 'signup' && (
                <p className="text-[11px] text-slate-400 bg-[#0b132b]/60 p-3 rounded-xl border border-slate-800 leading-relaxed">
                  🔒 Upon sign-up, your default system username will be automatically assigned using our Wilmington landmark identity generator rule.
                </p>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3.5 rounded-xl bg-[#00f5d4] text-[#0b132b] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#00f5d4]/90 transition-colors cursor-pointer shadow-lg shadow-[#00f5d4]/20 disabled:opacity-50 mt-4"
              >
                {authMode === 'signup' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                <span>{authSubmitting ? 'Processing...' : authMode === 'signup' ? 'Complete Sign Up & Continue' : 'Sign In to Account'}</span>
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Dashboard State */
          <>
            {/* User Banner Header Card */}
            <div className="relative bg-gradient-to-br from-[#1c2541] to-[#0b132b] border border-slate-700/70 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#00f5d4]/5 rounded-full blur-3xl pointer-events-none" />

              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-[#00f5d4]/10 border-2 border-[#00f5d4]/40 flex items-center justify-center text-[#00f5d4] shadow-lg shadow-[#00f5d4]/10">
                    <UserIcon className="w-8 h-8 md:w-10 md:h-10" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl md:text-2xl font-black text-white">{displayName || systemUsername}</h1>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] text-[10px] font-extrabold uppercase">
                        {role}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono">System ID: @{systemUsername}</p>
                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-300">
                      <MapPin className="w-3.5 h-3.5 text-red-400" />
                      <span>Home Neighborhood: <strong className="text-white">{homeNeighborhood || 'Not Assigned'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Verification Button Task 6 */}
                <button
                  onClick={() => setShowVerificationModal(true)}
                  className="w-full md:w-auto px-4 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all cursor-pointer"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Apply for Verified Business, Non-Profit, or Civic Account</span>
                </button>
              </div>
            </div>

            {/* Interactive Profile Settings Form (TASK 4) */}
            <div className="bg-[#1c2541] border border-slate-700/70 rounded-3xl p-6 md:p-8 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-[#00f5d4]" />
                  <span>Edit Profile & Neighborhood Layer</span>
                </h3>
              </div>

              {profileSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-fadeIn">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleProfileUpdate} className="space-y-4 pt-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <span>Public Display Name</span>
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      placeholder="Enter display name..."
                      className="w-full px-4 py-2.5 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-red-400" />
                      <span>Home Neighborhood Layer</span>
                    </label>
                    <select
                      value={editNeighborhood}
                      onChange={(e) => setEditNeighborhood(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#0b132b] border border-slate-700 text-white text-xs focus:outline-none focus:border-[#00f5d4] cursor-pointer"
                    >
                      <option value="">-- Select Wilmington Neighborhood --</option>
                      {neighborhoods.map((nh) => (
                        <option key={nh.id} value={nh.name} className="bg-[#1c2541]">
                          {nh.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="px-5 py-2.5 rounded-xl bg-[#00f5d4] text-[#0b132b] font-bold text-xs flex items-center gap-2 hover:bg-[#00f5d4]/90 transition-colors cursor-pointer shadow-md shadow-[#00f5d4]/10 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{profileSaving ? 'Saving to Neon...' : 'Save Profile Settings'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 md:gap-4">
              <div className="bg-[#1c2541]/80 border border-slate-700/60 rounded-2xl p-4 text-center">
                <MessageSquare className="w-5 h-5 text-[#00f5d4] mx-auto mb-1" />
                <span className="block text-lg font-black text-white">{userPosts.length}</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Authored Echoes</span>
              </div>
              <div className="bg-[#1c2541]/80 border border-slate-700/60 rounded-2xl p-4 text-center">
                <Sparkles className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <span className="block text-lg font-black text-white">300m</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Base Launch Radius</span>
              </div>
              <div className="bg-[#1c2541]/80 border border-slate-700/60 rounded-2xl p-4 text-center">
                <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <span className="block text-lg font-black text-white">Active</span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Alpha Standing</span>
              </div>
            </div>

            {/* Authored Posts History Feed */}
            <div className="bg-[#1c2541]/90 border border-slate-700/60 rounded-3xl p-6 backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#00f5d4]" />
                  <span>Authored Post History</span>
                </h3>
                <span className="text-xs text-slate-400">{userPosts.length} posts published</span>
              </div>

              {loadingPosts ? (
                <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <Compass className="w-4 h-4 animate-spin text-[#00f5d4]" />
                  <span>Loading authored post stream...</span>
                </div>
              ) : userPosts.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <p className="text-xs text-slate-400">No authored posts recorded yet in local stream.</p>
                  <button
                    onClick={() => router.push('/')}
                    className="px-4 py-2 rounded-xl bg-[#00f5d4] text-[#0b132b] text-xs font-bold cursor-pointer"
                  >
                    Create Your First Echo
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {userPosts.map((post) => (
                    <div key={post.id} className="bg-[#0b132b] border border-slate-800 rounded-2xl p-4 space-y-2 hover:border-slate-700 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#00f5d4] uppercase px-2 py-0.5 rounded-md bg-[#00f5d4]/10">
                          {post.type || 'miniblog'}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white">{post.title}</h4>
                      <p className="text-xs text-slate-300 line-clamp-2">{post.content}</p>
                      <div className="flex items-center gap-4 pt-2 text-[10px] text-slate-400 border-t border-slate-800/60">
                        <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-400" /> {post.likes || 0} Likes</span>
                        <span>Radius: {post.currentRadius || 300}m</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Verification Modal Task 6 */}
      <VerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
      />

      {/* Onboarding Modal Task 5 */}
      <OnboardingModal
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
      />
    </div>
  )
}
