import { motion } from 'framer-motion'
import { memo } from 'react'
import { Microphone } from '@phosphor-icons/react'

interface Props {
  size?: number
  className?: string
}

export const MicTranscribing = memo(function MicTranscribing({
  size = 88,
  className = '',
}: Props) {
  return (
    <div
      className={`relative grid place-items-center ${className}`}
      style={{ width: size * 2, height: size * 2 }}
    >
      {[0, 0.5, 1].map((delay) => (
        <motion.span
          key={delay}
          className="absolute rounded-full border border-zinc-300"
          style={{ width: size, height: size }}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeOut',
            delay,
          }}
        />
      ))}

      <motion.div
        className="relative grid place-items-center rounded-full bg-ink shadow-lg"
        style={{ width: size, height: size }}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Microphone weight="fill" size={size * 0.42} className="text-white" />
      </motion.div>

      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1.5 px-3 py-1.5 rounded-full bg-white shadow-md border border-zinc-200"
        aria-label="memproses"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-zinc-900"
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1.1,
              repeat: Infinity,
              delay: i * 0.18,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  )
})
