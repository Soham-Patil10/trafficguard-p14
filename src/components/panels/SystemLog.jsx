import { useEffect, useRef } from 'react'
import { useStream } from '../../context/StreamContext'

const TYPE_COLORS = {
  attack: '#ef4444',
  defence: '#34d399',
  info: '#38bdf8',
  warn: '#f59e0b',
}

export default function SystemLog() {
  const { logLines, connected } = useStream()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines])

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          System Log
        </span>
        <span
          className={`text-[10px] font-mono ${
            connected ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {connected ? 'WS connected' : 'disconnected'}
        </span>
      </div>
      <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1 font-mono text-[11px]">
        {logLines.length === 0 ? (
          <div className="text-slate-600 py-2">No log entries yet</div>
        ) : (
          logLines.map((line, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="text-slate-600 shrink-0">{line.time}</span>
              <span style={{ color: TYPE_COLORS[line.type] ?? '#64748b' }}>
                {line.msg}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
