import { TrendingUp, TrendingDown } from 'lucide-react'

export default function StatCard({
  title,
  value,
  unit = '',
  sub,
  delta,
  deltaDir,
  color = '#34d399',
}) {
  const isNA = value === null || value === undefined || value === 'N/A'
  const display = isNA ? 'N/A' : value
  const shownColor = isNA ? '#64748b' : color

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300 group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          {title}
        </span>
      </div>
      <div>
        <div className="text-2xl font-bold font-mono tracking-tight" style={{ color: shownColor }}>
          {display}{!isNA && unit}
        </div>
        {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
        {delta && (
          <span
            className={`inline-flex items-center gap-1 mt-2 text-[11px] font-mono px-2 py-0.5 rounded-full ${
              deltaDir === 'up' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}
          >
            {deltaDir === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}
