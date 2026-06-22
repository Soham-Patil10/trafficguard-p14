import { useState } from 'react'
import { useAttack } from '../context/AttackContext'
import { useStream } from '../context/StreamContext'
import { generateReport } from '../api/client'
import { FileText, Download, Loader2 } from 'lucide-react'

export default function ReportPage() {
  const { metrics, attacks, defences } = useAttack()
  const { frameHistory } = useStream()
  const [generating, setGenerating] = useState(false)
  const na = (v, u = '') => (v === null || v === undefined ? 'N/A' : `${v}${u}`)

  async function handleGenerateReport() {
    setGenerating(true)
    try {
      const sessionData = {
        metrics,
        attacks,
        defences,
        frameHistory: frameHistory.slice(0, 100),
        generatedAt: new Date().toISOString(),
      }

      const response = await generateReport(sessionData)
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: 'application/pdf' })
      )
      const link = document.createElement('a')
      link.href = url
      link.setAttribute(
        'download',
        `TrafficGuard_Security_Report_${Date.now()}.pdf`
      )
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (e) {
      console.error('Report generation failed', e)
    } finally {
      setGenerating(false)
    }
  }

  const enabledAttacks = Object.entries(attacks)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k.toUpperCase())

  const enabledDefences = Object.entries(defences)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k.toUpperCase())

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25">
          <FileText className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Security Audit Report</h2>
          <p className="text-xs text-slate-500">
            Generate a downloadable PDF report of the current session
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Session Summary
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Clean Accuracy</span>
              <span className="text-emerald-400 font-mono font-bold">{na(metrics.cleanAcc, '%')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Robust Accuracy</span>
              <span className="text-amber-400 font-mono font-bold">{na(metrics.robustAcc, '%')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Attack Success Rate</span>
              <span className="text-red-400 font-mono font-bold">{na(metrics.asr, '%')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Certified Radius</span>
              <span className="text-sky-400 font-mono font-bold">{na(metrics.certifiedRadius)}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Active Configuration
          </h3>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-slate-500 block mb-1">Active Attacks</span>
              <div className="flex flex-wrap gap-1.5">
                {enabledAttacks.length > 0 ? (
                  enabledAttacks.map(a => (
                    <span
                      key={a}
                      className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[11px] font-mono rounded-full border border-red-500/20"
                    >
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-600 text-xs">None active</span>
                )}
              </div>
            </div>
            <div>
              <span className="text-xs text-slate-500 block mb-1">Active Defences</span>
              <div className="flex flex-wrap gap-1.5">
                {enabledDefences.length > 0 ? (
                  enabledDefences.map(d => (
                    <span
                      key={d}
                      className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[11px] font-mono rounded-full border border-emerald-500/20"
                    >
                      {d}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-600 text-xs">None active</span>
                )}
              </div>
            </div>
            <div className="text-xs text-slate-500">
              Frames captured: {frameHistory.length}
            </div>
          </div>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={handleGenerateReport}
          disabled={generating}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {generating ? 'Generating...' : 'Download PDF Report'}
        </button>
      </div>
    </div>
  )
}
