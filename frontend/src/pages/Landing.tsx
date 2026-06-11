import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, MicrophoneStage } from '@phosphor-icons/react'
import { Logo } from '../components/Navbar'
import { MAX_UPLOAD_MB } from '../lib/limits'

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col">
      <header className="flex items-center gap-2.5 px-6 pt-8 md:px-12">
        <Logo size={32} />
        <span className="text-[15px] font-semibold tracking-tight">ALTO</span>
      </header>

      <main className="flex-1 flex flex-col justify-center px-6 md:px-12 pb-24 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 mb-8">
            <MicrophoneStage weight="fill" size={14} className="text-zinc-500" />
            <span className="text-[11px] font-medium text-zinc-600 tracking-wide">
              Didukung Deepgram dan OpenAI
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl tracking-tightest leading-[1.02] font-semibold mb-6">
            Rapat panjang.
            <br />
            <span className="text-zinc-400">Transkrip rapi.</span>
          </h1>

          <p className="text-[15px] sm:text-base text-zinc-500 leading-relaxed max-w-[46ch] mb-10">
            Upload audio meeting hingga {MAX_UPLOAD_MB} MB. Dapatkan transkrip dengan timestamp dan label
            pembicara — langsung bisa di-copy atau di-export.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate('/login')}
              className="btn-primary text-base px-7 py-3.5 rounded-2xl gap-2.5"
            >
              Mulai Sekarang
              <ArrowRight weight="bold" size={18} />
            </motion.button>
          </div>
        </motion.div>
      </main>

      <footer className="px-6 pb-8 md:px-12">
        <p className="text-xs text-zinc-400">
          ALTO &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  )
}
