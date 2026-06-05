import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MagnifyingGlass } from '@phosphor-icons/react'

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 pb-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 100, damping: 22 }}
        className="text-center max-w-sm"
      >
        <div className="grid place-items-center w-20 h-20 rounded-3xl bg-zinc-100 border border-zinc-200 mx-auto mb-6">
          <MagnifyingGlass size={36} weight="duotone" className="text-zinc-400" />
        </div>

        <p className="eyebrow mb-2">404</p>
        <h1 className="text-3xl font-semibold tracking-tightest leading-tight mb-3">
          Halaman tidak ditemukan
        </h1>
        <p className="text-sm text-zinc-500 leading-relaxed mb-8">
          URL yang kamu akses tidak ada atau sudah dipindahkan.
        </p>

        <Link to="/" className="btn-primary inline-flex">
          <ArrowLeft size={16} weight="bold" />
          Kembali ke Beranda
        </Link>
      </motion.div>
    </div>
  )
}
