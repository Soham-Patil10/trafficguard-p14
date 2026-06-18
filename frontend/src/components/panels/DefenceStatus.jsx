import { useAttack } from '../../context/AttackContext'
import { ShieldCheck, ShieldOff } from 'lucide-react'

const DEFENCE_LABELS = {
  advtrain: 'Adversarial Training',
  jpeg: 'JPEG Compression',
  smooth: 'Bit Smoothing',
  rs: 'Randomized Smoothing',
  ensemble: 'Ensemble Defense',
}

export default function DefenceStatus() {
  const { defences } = useAttack()

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Defence Status
        </span>
      </div>
      <div className="space-y-2">
        {Object.entries(defences).map(([key, config]) => (
          <div
            key={key}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all duration-200 ${
              config.enabled
                ? 'bg-emerald-500/8 border border-emerald-500/20 text-emerald-400'
                : 'bg-slate-800/40 border border-slate-700/30 text-slate-500'
            }`}
          >
            <div className="flex items-center gap-2">
              {config.enabled ? (
                <ShieldCheck className="w-3.5 h-3.5" />
              ) : (
                <ShieldOff className="w-3.5 h-3.5" />
              )}
              <span>{DEFENCE_LABELS[key] ?? key}</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                config.enabled
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700/40 text-slate-500'
              }`}
            >
              {config.enabled ? 'ACTIVE' : 'OFF'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
