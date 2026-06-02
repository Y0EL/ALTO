import { motion } from 'framer-motion'
import { memo } from 'react'

interface Props {
  size?: number
}

export const SuccessCheck = memo(function SuccessCheck({ size = 88 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" fill="none" aria-label="berhasil">
      <motion.circle
        cx="44"
        cy="44"
        r="40"
        stroke="#0a0a0b"
        strokeWidth="2.5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
      />
      <motion.path
        d="M28 45 L40 57 L62 33"
        stroke="#0a0a0b"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.35, ease: 'easeOut' }}
      />
    </svg>
  )
})
