import { motion } from 'framer-motion'
import { memo } from 'react'

interface Props {
  bars?: number
  className?: string
  color?: string
  active?: boolean
}

export const WaveformBars = memo(function WaveformBars({
  bars = 7,
  className = 'w-32 h-16',
  color = '#0a0a0b',
  active = true,
}: Props) {
  return (
    <div
      className={`flex items-center justify-center gap-1.5 ${className}`}
      aria-label="audio waveform"
    >
      {Array.from({ length: bars }).map((_, i) => {
        const offset = i * 0.12
        return (
          <motion.span
            key={i}
            className="rounded-full"
            style={{ backgroundColor: color, width: 4 }}
            initial={{ height: 6 }}
            animate={
              active
                ? {
                    height: [8, 28 + ((i * 7) % 24), 12, 36 - ((i * 5) % 20), 8],
                  }
                : { height: 8 }
            }
            transition={{
              duration: 1.6,
              repeat: active ? Infinity : 0,
              ease: 'easeInOut',
              delay: offset,
            }}
          />
        )
      })}
    </div>
  )
})
