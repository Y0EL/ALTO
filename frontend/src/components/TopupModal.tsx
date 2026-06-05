import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Coin, Check } from '@phosphor-icons/react'
import { api, type ManagedUser } from '../lib/api'
import { formatDuration } from '../lib/format'

interface Props {
  user: ManagedUser | null
  onClose: () => void
  onSuccess: () => void
}

const QUICK_OPTIONS = [
  { label: '+30m', minutes: 30 },
  { label: '+1j', minutes: 60 },
  { label: '+2j', minutes: 120 },
  { label: '+5j', minutes: 300 },
]

export function TopupModal({ user, onClose, onSuccess }: Props) {
  const [minutes, setMinutes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = parseInt(minutes, 10)
  const valid = !isNaN(parsed) && parsed > 0

  const handleQuick = (m: number) => setMinutes(String(m))

  const handleConfirm = async () => {
    if (!user || !valid) return
    setLoading(true)
    setError(null)
    try {
      await api.patch(`/users/${user.id}/credits`, { addSeconds: parsed * 60 })
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal topup')
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {user && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            className="fixed bottom-0 inset-x-0 z-[70] bg-white rounded-t-3xl shadow-2xl border-t border-zinc-200/80"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          >
            <div className="flex justify-center pt-2.5 pb-4">
              <div className="w-10 h-1 rounded-full bg-zinc-300" />
            </div>

            <div className="px-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold">Topup Kredit</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">untuk <span className="font-medium text-zinc-800">{user.username}</span></p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 grid place-items-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>

              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80 mb-5">
                <Coin weight="duotone" size={18} className="text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wide font-medium">Sisa Kredit</p>
                  <p className="text-sm font-semibold tabular-nums">{formatDuration(user.creditSeconds)}</p>
                </div>
              </div>

              <p className="text-xs text-zinc-500 mb-2 font-medium">Tambah berapa menit?</p>
              <div className="flex gap-2 mb-3">
                {QUICK_OPTIONS.map((opt) => (
                  <button
                    key={opt.minutes}
                    onClick={() => handleQuick(opt.minutes)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      minutes === String(opt.minutes)
                        ? 'bg-ink text-white border-ink'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="relative mb-4">
                <input
                  type="number"
                  min="1"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="Atau ketik jumlah menit…"
                  className="input w-full pr-12"
                />
                {valid && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 tabular-nums">
                    = {formatDuration(parsed * 60)}
                  </span>
                )}
              </div>

              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

              <button
                onClick={handleConfirm}
                disabled={!valid || loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Memproses…'
                ) : (
                  <>
                    <Check size={16} weight="bold" />
                    Tambah {valid ? formatDuration(parsed * 60) : 'Kredit'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
