import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { House, ClockCounterClockwise, UserCircle, SignOut, ShieldStar, X } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)

  if (!user) return null

  const isHome = location.pathname === '/'
  const isHistory = location.pathname === '/' // same page, just scroll target

  const handleLogout = async () => {
    setProfileOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const scrollToHistory = () => {
    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' })
      }, 200)
    } else {
      document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch h-16">
          <NavTab
            icon={<House weight={isHome ? 'fill' : 'regular'} size={22} />}
            label="Beranda"
            active={isHome && !profileOpen}
            onClick={() => { setProfileOpen(false); navigate('/') }}
          />
          <NavTab
            icon={<ClockCounterClockwise weight="regular" size={22} />}
            label="Riwayat"
            active={false}
            onClick={() => { setProfileOpen(false); scrollToHistory() }}
          />
          <NavTab
            icon={<UserCircle weight={profileOpen ? 'fill' : 'regular'} size={22} />}
            label="Profil"
            active={profileOpen}
            onClick={() => setProfileOpen((v) => !v)}
          />
        </div>
      </nav>

      <AnimatePresence>
        {profileOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="md:hidden fixed inset-0 z-[45] bg-black/20"
              onClick={() => setProfileOpen(false)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl shadow-xl border-t border-zinc-200/80"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <div className="flex justify-center pt-2.5 pb-4">
                <div className="w-10 h-1 rounded-full bg-zinc-300" />
              </div>

              <div className="px-5 pb-2">
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-zinc-50 border border-zinc-200/80">
                  <div className="w-10 h-10 rounded-full bg-ink grid place-items-center text-white font-semibold text-sm flex-shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{user.username}</p>
                    {user.isAdmin && (
                      <span className="text-[10px] font-medium tracking-wide bg-zinc-900 text-white rounded-full px-2 py-0.5">
                        admin
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setProfileOpen(false)}
                    className="w-7 h-7 grid place-items-center rounded-full bg-zinc-200 text-zinc-600"
                  >
                    <X size={14} weight="bold" />
                  </button>
                </div>
              </div>

              <div className="px-5 pt-1 flex flex-col gap-1">
                {user.isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors"
                  >
                    <ShieldStar weight="bold" size={18} className="text-zinc-600" />
                    Manajemen User
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                >
                  <SignOut weight="bold" size={18} />
                  Keluar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function NavTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-1 relative pt-1 transition-colors"
    >
      {active && (
        <motion.div
          layoutId="tab-indicator"
          className="absolute top-0 w-8 h-[3px] rounded-full bg-ink"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <span className={`transition-colors ${active ? 'text-ink' : 'text-zinc-400'}`}>{icon}</span>
      <span className={`text-[10px] font-medium transition-colors ${active ? 'text-ink' : 'text-zinc-400'}`}>
        {label}
      </span>
    </button>
  )
}
