import { useStream } from '../../context/StreamContext'
import { AlertTriangle } from 'lucide-react'

const PRED_COLORS = {
  Low: '#34d399',
  Medium: '#f59e0b',
  High: '#ef4444',
}

export default function FrameComparison() {
  const { latestFrame } = useStream()

  if (!latestFrame) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Frame Comparison
          </span>
        </div>
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
          Waiting for frame stream...
        </div>
      </div>
    )
  }

  const cleanPred = String(latestFrame.clean_pred ?? 'Low')
  const attackPred = String(latestFrame.attack_pred ?? 'High')
  const cleanConf = Number(latestFrame.clean_conf ?? 0.9) * 100
  const attackConf = Number(latestFrame.attack_conf ?? 0.85) * 100
  const attackType = String(latestFrame.attack_type ?? 'FGSM')
  const epsilon = String(latestFrame.epsilon ?? '0.10')
  const frameId = String(latestFrame.frame_id ?? '—')
  const flipped = cleanPred !== attackPred

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Frame Comparison — Clean vs Attacked
        </span>
        <span className="text-[10px] font-mono text-slate-600">
          Frame #{frameId}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Clean frame */}
        <div className="rounded-lg overflow-hidden border border-slate-700/30">
          <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-mono px-2 py-1 border-b border-slate-700/30">
            Clean Input
          </div>
          <div className="h-28 bg-slate-900 flex items-center justify-center text-slate-700 text-xs">
            {latestFrame.clean_image ? (
              <img
                src={`data:image/jpeg;base64,${latestFrame.clean_image}`}
                alt="Clean traffic frame"
                className="w-full h-full object-cover"
              />
            ) : (
              'No image data'
            )}
          </div>
          <div className="px-2 py-1.5 text-[11px] font-mono">
            <span style={{ color: PRED_COLORS[cleanPred], fontWeight: 700 }}>
              {cleanPred.toUpperCase()} CONGESTION
            </span>
            <span className="text-slate-500 ml-2">
              conf: {cleanConf.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Attacked frame */}
        <div className="rounded-lg overflow-hidden border border-slate-700/30">
          <div className="bg-red-500/10 text-red-400 text-[10px] font-mono px-2 py-1 border-b border-slate-700/30">
            {attackType} e={epsilon}
          </div>
          <div className="h-28 bg-slate-900 flex items-center justify-center text-slate-700 text-xs">
            {latestFrame.attack_image ? (
              <img
                src={`data:image/jpeg;base64,${latestFrame.attack_image}`}
                alt="Adversarial frame"
                className="w-full h-full object-cover"
              />
            ) : (
              'No image data'
            )}
          </div>
          <div className="px-2 py-1.5 text-[11px] font-mono">
            <span style={{ color: PRED_COLORS[attackPred], fontWeight: 700 }}>
              {attackPred.toUpperCase()} CONGESTION
            </span>
            <span className="text-slate-500 ml-2">
              conf: {attackConf.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {flipped && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[11px] font-mono text-red-400">
          <AlertTriangle className="w-3.5 h-3.5" />
          PREDICTION FLIPPED: {cleanPred.toUpperCase()} →{' '}
          {attackPred.toUpperCase()}
        </div>
      )}
    </div>
  )
}
