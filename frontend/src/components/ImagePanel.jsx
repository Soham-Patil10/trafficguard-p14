import { useState, useEffect } from 'react'
import { ImageIcon, X } from 'lucide-react'

// Reusable image tile with a click-to-open full preview (Esc / backdrop / X to close).
export default function ImagePanel({ label, src, badge, badgeColor, sub }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        {badge && <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>}
      </div>
      <div className="aspect-square rounded-lg overflow-hidden bg-slate-700 border border-slate-600 flex items-center justify-center group">
        {src ? (
          <img
            src={src}
            alt={label}
            onClick={() => setOpen(true)}
            className="w-full h-full object-cover cursor-zoom-in transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <ImageIcon className="w-10 h-10 text-slate-600" />
        )}
      </div>
      {sub && <span className="text-xs font-mono text-center text-slate-300">{sub}</span>}

      {open && src && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 cursor-zoom-out"
        >
          <button
            onClick={() => setOpen(false)}
            aria-label="Close preview"
            className="absolute top-4 right-4 text-slate-300 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img
              src={src}
              alt={`${label} preview`}
              className="max-w-[85vw] max-h-[80vh] object-contain rounded-lg border border-slate-500 shadow-2xl"
            />
            <span className="text-slate-200 text-sm bg-slate-800/90 px-3 py-1 rounded-full">
              {label}{sub ? ` — ${sub}` : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
