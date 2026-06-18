import { useStream } from '../../context/StreamContext'

const PRED_COLORS = {
  Low: '#34d399',
  Medium: '#f59e0b',
  High: '#ef4444',
}

export default function PredictionHistory() {
  const { frameHistory } = useStream()

  const history = frameHistory.slice(0, 20)

  if (history.length === 0) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Prediction History
          </span>
        </div>
        <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
          No frames received yet
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Prediction History
        </span>
        <span className="text-[10px] font-mono text-slate-600">
          Last {history.length} frames
        </span>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {history.map((frame, i) => {
          const clean = String(frame.clean_pred ?? '?')
          const attack = String(frame.attack_pred ?? '?')
          const flipped = clean !== attack
          return (
            <div
              key={i}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded text-[11px] font-mono ${
                flipped
                  ? 'bg-red-500/5 border border-red-500/15'
                  : 'bg-slate-800/30'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-slate-600">#{frame.frame_id}</span>
                <span style={{ color: PRED_COLORS[clean] ?? '#94a3b8' }}>
                  {clean.toUpperCase()}
                </span>
                <span className="text-slate-600">→</span>
                <span style={{ color: PRED_COLORS[attack] ?? '#94a3b8' }}>
                  {attack.toUpperCase()}
                </span>
              </div>
              <span className="text-slate-600">{String(frame.timestamp ?? '')}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
