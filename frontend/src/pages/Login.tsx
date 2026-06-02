import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeSlash, ArrowRight } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'
import { ApiError } from '../lib/api'
import { Logo } from '../components/Navbar'

export default function Login() {
  const { user, login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true })
  }, [user, loading, navigate, from])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
      else setError('Gagal masuk. Coba lagi.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6 py-12 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 22 }}
        className="w-full max-w-sm"
      >
        <div className="flex justify-center mb-10">
          <Logo size={48} />
        </div>

        <h1 className="text-center text-3xl md:text-4xl tracking-tightest leading-[1.05] font-semibold">
          Masuk ke ALTO
        </h1>
        <p className="mt-2.5 text-center text-[15px] text-zinc-500 leading-relaxed">
          Akses tim only. Hubungi admin kalau butuh akun.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-4">
          <div>
            <label htmlFor="username" className="label">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="yoel"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-12"
                placeholder="••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 rounded-lg text-zinc-500 hover:bg-zinc-100"
                aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="btn-primary w-full mt-6"
          >
            {submitting ? (
              'Memverifikasi…'
            ) : (
              <>
                Masuk
                <ArrowRight weight="bold" size={16} />
              </>
            )}
          </button>
        </form>

        <p className="mt-10 text-center text-xs text-zinc-400">
          ALTO · meeting transcripts
        </p>
      </motion.div>
    </div>
  )
}
