import { Link, useLocation, useNavigate } from 'react-router-dom'
import { SignOut, ShieldStar } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

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
      </div>
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
