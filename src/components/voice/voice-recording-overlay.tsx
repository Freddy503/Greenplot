'use client'

import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  isRecording: boolean
  isProcessing: boolean
  duration: number
  onCancel: () => void
  onStop: () => void
}

export function VoiceRecordingOverlay({ isRecording, isProcessing, duration, onCancel, onStop }: Props) {
  const mm = Math.floor(duration / 60).toString().padStart(2, '0')
  const ss = (duration % 60).toString().padStart(2, '0')

  return (
    <AnimatePresence>
      {(isRecording || isProcessing) && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-[#fafaf8]/80 backdrop-blur-md flex flex-col items-center justify-center"
        >
          {/* Animated background circles */}
          {isRecording && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {Array.from({ length: 4 }).map((_, i) => (
                <motion.div key={i}
                  className="absolute rounded-full border border-primary/20"
                  style={{ width: 140 + i * 60, height: 140 + i * 60 }}
                  animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' }}
                />
              ))}
            </div>
          )}

          <div className="relative z-10 flex flex-col items-center gap-8">
            {/* Mic button with pulse */}
            <motion.div animate={isRecording ? { scale: [1, 1.05, 1] } : {}} transition={isRecording ? { duration: 1.5, repeat: Infinity } : {}}>
              <div className="w-32 h-32 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                  <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-[#16a34a]/30">
                    <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: '"FILL" 1' }}>{isProcessing ? 'progress_activity' : 'mic'}</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Timer + Status */}
            <div className="text-center">
              <motion.p className="text-3xl font-mono font-bold text-[#111211]" animate={isRecording ? { opacity: [1, 0.7, 1] } : {}} transition={isRecording ? { duration: 1, repeat: Infinity } : {}}>{mm}:{ss}</motion.p>
              <p className="text-sm text-[#5c5d5c] mt-1">{isProcessing ? 'Transcribing...' : 'Listening...'}</p>
            </div>

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex items-center gap-2 text-[#16a34a]">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span className="text-sm font-medium">Processing...</span>
              </div>
            )}

            {/* Control buttons */}
            {!isProcessing && (
              <div className="flex items-center gap-6">
                <button onClick={onCancel} className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-[#eeeeec] border border-[#e0dfdd]/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-xl">close</span>
                  </div>
                  <span className="text-xs">Cancel</span>
                </button>

                <button onClick={onStop} className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-[#dc2626] shadow-lg shadow-[#dc2626]/30 flex items-center justify-center">
                    <div className="w-6 h-6 rounded bg-white" />
                  </div>
                  <span className="text-xs text-[#dc2626] font-medium">Stop</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
