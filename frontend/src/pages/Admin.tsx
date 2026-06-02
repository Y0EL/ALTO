import { useEffect, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Trash,
  Key,
  ShieldStar,
  User as UserIcon,
  CheckCircle,
} from '@phosphor-icons/react'
import { ApiError, api, type ManagedUser } from '../lib/api'
import { formatRelativeTime } from '../lib/format'
import { useAuth } from '../hooks/useAuth'

export default function Admin() {
  const { user: self } = useAuth()
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const load = async () => {
    try {
      const data = await api.get<{ users: ManagedUser[] }>('/users')
      setUsers(data.users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat user')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const flashSuccess = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 2500)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      await api.post('/users', {
        username: newUsername.trim(),
        password: newPassword,
        isAdmin: makeAdmin,
      })
      setNewUsername('')
      setNewPassword('')
      setMakeAdmin(false)
      await load()
      flashSuccess(`User "${newUsername}" dibuat`)
    } catch (err) {
      if (err instanceof ApiError) setCreateError(err.message)
      else setCreateError('Gagal membuat user')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (u: ManagedUser) => {
    if (u.id === self?.id) {
      alert('Tidak bisa hapus akun sendiri')
      return
    }
    if (!confirm(`Hapus user "${u.username}"? Semua transkripnya juga akan terhapus.`)) return
    try {
      await api.delete(`/users/${u.id}`)
      await load()
      flashSuccess(`User "${u.username}" dihapus`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus')
    }
  }

  const handleResetPassword = async (u: ManagedUser) => {
    const np = prompt(`Password baru untuk "${u.username}":`)
    if (!np || np.length < 3) {
      if (np !== null) alert('Password minimal 3 karakter')
      return
    }
    try {
      await api.patch(`/users/${u.id}/password`, { newPassword: np })
      flashSuccess(`Password "${u.username}" direset`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal reset password')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 md:px-8 py-12">
      <header className="mb-10">
        <p className="eyebrow mb-2">Admin</p>
        <h1 className="text-3xl md:text-4xl tracking-tightest font-semibold">
          Manajemen User
        </h1>
        <p className="mt-2 text-sm text-zinc-600 max-w-md leading-relaxed">
          Tambah, hapus, atau reset password anggota tim. Setiap user punya history transkrip
          terpisah.
        </p>
      </header>

      {flash && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex items-center gap-2 rounded-xl bg-ink text-white px-4 py-2.5 text-sm"
        >
          <CheckCircle weight="fill" size={16} />
          {flash}
        </motion.div>
      )}

      <section className="card p-5 sm:p-7 mb-10 shadow-sm">
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Plus weight="bold" size={16} />
          Tambah User
        </h2>
        <form onSubmit={handleCreate} className="grid sm:grid-cols-[1fr_1fr_auto] gap-3">
          <div>
            <label className="label">Username</label>
            <input
              type="text"
              required
              autoCapitalize="none"
              spellCheck={false}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="input"
              placeholder="contoh: rangga"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="text"
              required
              minLength={3}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              placeholder="min. 3 karakter"
            />
          </div>
          <div className="sm:self-end">
            <button
              type="submit"
              disabled={creating || !newUsername || !newPassword}
              className="btn-primary w-full"
            >
              {creating ? 'Membuat…' : 'Tambah'}
            </button>
          </div>

          <label className="sm:col-span-3 flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
              className="rounded border-zinc-300 text-ink focus:ring-zinc-900/20"
            />
            Jadikan admin (bisa kelola user lain)
          </label>

          {createError && <p className="sm:col-span-3 text-sm text-red-600">{createError}</p>}
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3 px-1">Semua User</h2>

        {error && <p className="text-sm text-red-600 px-1">{error}</p>}

        {users === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-zinc-500 px-1">Belum ada user.</p>
        ) : (
          <ul className="divide-y divide-zinc-200/80 border-t border-b border-zinc-200/80">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-4 py-4 px-1 -mx-1 hover:bg-zinc-50 rounded-lg"
              >
                <div
                  className={`grid place-items-center w-10 h-10 rounded-xl flex-shrink-0 ${
                    u.isAdmin
                      ? 'bg-ink text-white'
                      : 'bg-zinc-100 border border-zinc-200 text-zinc-600'
                  }`}
                >
                  {u.isAdmin ? (
                    <ShieldStar weight="fill" size={18} />
                  ) : (
                    <UserIcon size={18} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {u.username}
                    {u.id === self?.id && (
                      <span className="ml-2 text-[11px] text-zinc-400 font-normal">(kamu)</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {u.isAdmin ? 'admin · ' : ''}
                    dibuat {formatRelativeTime(u.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleResetPassword(u)}
                    className="grid place-items-center w-9 h-9 rounded-lg hover:bg-zinc-200 text-zinc-600"
                    title="Reset password"
                  >
                    <Key size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(u)}
                    disabled={u.id === self?.id}
                    className="grid place-items-center w-9 h-9 rounded-lg hover:bg-red-50 hover:text-red-600 text-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-600"
                    title="Hapus user"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
