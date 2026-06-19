import { useState } from 'react'
import { ShieldCheck, Play, AlertTriangle, ArrowRight } from 'lucide-react'
import { applyDefence } from '../api/client'
import { useAttack } from '../context/AttackContext'
import ImagePanel from '../components/ImagePanel'

const DEFENCE_INFO = {
  advtrain: { desc: 'Trains the model on adversarial examples to improve robustness against perturbation attacks.', paper: 'Madry et al., 2018' },
  jpeg: { desc: 'Compresses input through JPEG encoding/decoding to strip high-frequency adversarial noise.', paper: 'Das et al., 2018' },
  smooth: { desc: 'Applies spatial smoothing (median filter) to remove fine-grained perturbations.', paper: 'Xu et al., 2018' },
  rs: { desc: 'Certifiable defense: adds Gaussian noise to inputs and votes on predictions, providing a provable robustness radius.', paper: 'Cohen et al., 2019' },
  ensemble: { desc: 'Aggregates predictions from multiple independently trained models to dilute single-model vulnerabilities.', paper: 'Tramer et al., 2020' },
}

const stripDataUrl = (d) => (d && d.includes(',') ? d.split(',')[1] : d)

export default function Defences() {
  const { lastAttackResult, defences, toggleDef } = useAttack()
  const [running, setRunning] = useState(false)
  const [windowSize, setWindowSize] = useState(3)
  const [defended, setDefended] = useState(null)
  const [error, setError] = useState(null)

  const runDefence = async () => {
    if (!lastAttackResult) return
    setRunning(true); setDefended(null); setError(null)
    try {
      const res = await applyDefence(stripDataUrl(lastAttackResult.attackImage), windowSize)
      const d = res.data
      setDefended({
        image: `data:image/jpeg;base64,${d.defended_image}`,
        pred: d.defended_pred,
        conf: (d.defended_conf * 100).toFixed(1),
        recovered: d.defended_pred === lastAttackResult.cleanPred,
      })
    } catch (e) {
      setError(e?.message || 'request failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Defence Lab</h2>
          <p className="text-slate-400 text-sm">Take the attacked image from the Attack Lab and recover it with spatial smoothing</p>
        </div>
      </div>

      {!lastAttackResult ? (
        <div className="bg-[#12151f] border border-slate-700 rounded-xl p-10 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-slate-300 font-medium">No attacked image yet</p>
          <p className="text-slate-500 text-sm">Run an attack in the Attack Lab first — the attacked image will appear here automatically.</p>
        </div>
      ) : (
        <div className="bg-[#12151f] border border-slate-700 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            <div className="text-sm text-slate-400">
              From Attack Lab: <span className="text-slate-200">{lastAttackResult.fileName}</span>
              &nbsp;·&nbsp; {lastAttackResult.attackType} &nbsp;·&nbsp; ε = <span className="font-mono">{lastAttackResult.epsilon}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Smoothing window</label>
              <select
                value={windowSize}
                onChange={(e) => setWindowSize(parseInt(e.target.value))}
                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200"
              >
                <option value={3}>3 × 3</option>
                <option value={5}>5 × 5</option>
                <option value={7}>7 × 7</option>
              </select>
              <button
                onClick={runDefence}
                disabled={running}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
              >
                {running ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                {running ? 'Running...' : 'Run Defence'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImagePanel label="Before — Attacked" src={lastAttackResult.attackImage} badge="Perturbed" badgeColor="bg-red-500/20 text-red-400"
              sub={`${lastAttackResult.attackPred} · ${(lastAttackResult.attackConf * 100).toFixed(1)}%`} />
            <ImagePanel label="After — Defended" src={defended ? defended.image : null} badge={defended ? 'Smoothed' : null} badgeColor="bg-green-500/20 text-green-400"
              sub={defended ? `${defended.pred} · ${defended.conf}%` : null} />
          </div>

          {error && (
            <div className="rounded-lg p-4 border bg-red-500/10 border-red-500/30 text-sm text-red-400">
              Could not reach the backend ({error}). Is uvicorn running on http://localhost:8000?
            </div>
          )}

          {defended && !error && (
            <div className={`rounded-lg p-4 border flex items-start gap-3 ${
              defended.recovered ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              {defended.recovered
                ? <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                : <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />}
              <div className="text-sm space-y-1">
                <p className={`font-semibold ${defended.recovered ? 'text-green-400' : 'text-amber-400'}`}>
                  {defended.recovered ? 'Defence recovered the original prediction' : 'Defence did not fully recover the prediction'}
                </p>
                <p className="text-slate-400">
                  clean: <span className="text-blue-300">{lastAttackResult.cleanPred}</span>
                  &nbsp;·&nbsp; attacked: <span className="text-red-300">{lastAttackResult.attackPred}</span>
                  &nbsp;·&nbsp; defended: <span className="text-green-300">{defended.pred}</span> ({defended.conf}%)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Defence configuration reference */}
      <div>
        <h3 className="text-sm font-bold text-slate-300 mb-3">Defence configurations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(DEFENCE_INFO).map(([key, info]) => {
            const defence = defences[key]
            if (!defence) return null
            return (
              <div key={key} className={`rounded-xl border p-4 transition-all ${defence.enabled ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-slate-800/60 border-slate-700/40'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-200 uppercase font-mono">{key}</h4>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={defence.enabled} onChange={() => toggleDef(key)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                  </label>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-2">{info.desc}</p>
                <p className="text-[10px] text-slate-600 font-mono">Ref: {info.paper}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
