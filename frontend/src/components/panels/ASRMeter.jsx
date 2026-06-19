import { useMemo } from 'react'
import { useAttack } from '../../context/AttackContext'

const ARC_LENGTH = 220

export default function ASRMeter() {
  const { metrics } = useAttack()
  const { asr } = metrics
  const asrNum = typeof asr === 'number' ? asr : null

  const dashOffset = useMemo(
    () => (asrNum == null ? ARC_LENGTH : ARC_LENGTH - (asrNum / 100) * ARC_LENGTH),
    [asrNum]
  )

  const arcColor = asrNum == null ? '#64748b' : asrNum > 70 ? '#ef4444' : asrNum > 40 ? '#f59e0b' : '#34d399'

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Live ASR Meter
        </span>
      </div>
      <div className="flex items-center justify-center">
        <svg width="180" height="110" viewBox="0 0 180 110" overflow="visible" className="drop-shadow-lg">
          <path d="M20,95 A70,70 0 0,1 160,95" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round" />
          <path
            d="M20,95 A70,70 0 0,1 160,95"
            fill="none"
            stroke={arcColor}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease', filter: `drop-shadow(0 0 6px ${arcColor}40)` }}
          />
          <text x="90" y="85" textAnchor="middle" fontFamily="monospace" fontSize="26" fontWeight="700" fill={arcColor}>
            {asrNum == null ? 'N/A' : `${asrNum.toFixed(1)}%`}
          </text>
          <text x="90" y="102" textAnchor="middle" fontSize="8" fill="#64748b" letterSpacing="2">
            ATTACK SUCCESS RATE
          </text>
        </svg>
      </div>
    </div>
  )
}
