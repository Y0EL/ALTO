import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SignOut, ShieldStar, List, X } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 group">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">ALTO</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {user.isAdmin && (
            <Link
              to="/admin"
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                location.pathname === '/admin'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <ShieldStar weight="bold" size={16} className="inline -mt-0.5 mr-1" />
              Admin
            </Link>
          )}
          <div className="mx-2 h-5 w-px bg-zinc-200" />
          <span className="text-sm text-zinc-500">{user.username}</span>
          <button
            onClick={handleLogout}
            className="ml-2 px-3 py-1.5 rounded-full text-sm text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            <SignOut weight="bold" size={16} className="inline -mt-0.5 mr-1" />
            Keluar
          </button>
        </nav>

        <button
          className="md:hidden grid place-items-center w-10 h-10 rounded-full hover:bg-zinc-100"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <List size={20} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-zinc-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-1">
            <div className="px-2 py-2 text-sm text-zinc-500">
              {user.username}
              {user.isAdmin && (
                <span className="ml-2 inline-flex items-center rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white tracking-wide">
                  admin
                </span>
              )}
            </div>
            {user.isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="px-3 py-3 rounded-xl text-sm font-medium hover:bg-zinc-100 flex items-center gap-2"
              >
                <ShieldStar weight="bold" size={16} />
                Manajemen User
              </Link>
            )}
            <button
              onClick={() => {
                setOpen(false)
                void handleLogout()
              }}
              className="text-left px-3 py-3 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50 flex items-center gap-2"
            >
              <SignOut weight="bold" size={16} />
              Keluar
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-xl bg-ink text-white font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      A
    </span>
  )
}
