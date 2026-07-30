import { useState } from 'react'
import { useStream } from '../../context/StreamContext'
import { runFGSM, runPGD, runDeepFool } from '../../api/client'
import { AlertTriangle, Loader2 } from 'lucide-react'

const PRED_COLORS = {
  Low: '#34d399',
  Medium: '#f59e0b',
  High: '#ef4444',
}

// Attacks the user can run on the current frame. `live` = whatever the stream sends.
const ATTACKS = [
  { id: 'live', label: 'Live' },
  { id: 'fgsm', label: 'FGSM' },
  { id: 'pgd', label: 'PGD' },
  { id: 'deepfool', label: 'DeepFool' },
]

const stripDataUrl = (d) => (d && d.includes(',') ? d.split(',')[1] : d)

export default function FrameComparison() {
  const { latestFrame } = useStream()
  const [selected, setSelected] = useState('live')
  const [running, setRunning] = useState(false)
  const [override, setOverride] = useState(null) // result of a user-selected attack
  const [error, setError] = useState(null)

  // Run the chosen attack on the current frame's clean image
  const selectAttack = async (id) => {
    setSelected(id)
    setError(null)

    if (id === 'live') { setOverride(null); return }
    if (!latestFrame?.clean_image) {
      setError('No frame yet'); setOverride(null); return
    }

    setRunning(true)
    try {
      const b64 = stripDataUrl(latestFrame.clean_image)
      let res, attackType, epsilon = null
      if (id === 'pgd') {
        res = await runPGD(b64, 0.1, 40); attackType = 'PGD'; epsilon = '0.10'
      } else if (id === 'deepfool') {
        res = await runDeepFool(b64, 50); attackType = 'DeepFool'
      } else {
        res = await runFGSM(b64, 0.1); attackType = 'FGSM'; epsilon = '0.10'
      }
      const d = res.data
      setOverride({
        clean_image: latestFrame.clean_image,
        attack_image: d.attack_image,
        clean_pred: d.clean_pred,
        attack_pred: d.attack_pred,
        clean_conf: d.clean_conf,
        attack_conf: d.attack_conf,
        attack_type: attackType,
        epsilon,
        pert_l2: d.pert_l2 ?? null,
        iterations: d.iterations ?? null,
      })
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'attack failed')
      setOverride(null)
    } finally {
      setRunning(false)
    }
  }

  // What to display: a user-selected attack result, or the live stream frame
  const frame = selected === 'live' ? latestFrame : override

  const Selector = (
    <div className="flex items-center gap-1">
      {ATTACKS.map((a) => (
        <button
          key={a.id}
          onClick={() => selectAttack(a.id)}
          disabled={running}
          className={`text-[10px] font-mono px-2 py-0.5 rounded transition-colors disabled:opacity-50 ${
            selected === a.id
              ? 'bg-red-500/20 text-red-300 border border-red-500/40'
              : 'bg-slate-900/60 text-slate-500 border border-slate-700/40 hover:text-slate-300'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  )

  if (!frame) {
    return (
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Frame Comparison
          </span>
          {Selector}
        </div>
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
          {running ? (
            <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Running attack…</span>
          ) : error ? (
            <span className="text-amber-500">{error}</span>
          ) : (
            'Waiting for frame stream...'
          )}
        </div>
      </div>
    )
  }

  const cleanPred = String(frame.clean_pred ?? 'Low')
  const attackPred = String(frame.attack_pred ?? 'High')
  const cleanConf = Number(frame.clean_conf ?? 0.9) * 100
  const attackConf = Number(frame.attack_conf ?? 0.85) * 100
  const attackType = String(frame.attack_type ?? 'FGSM')
  const epsilon = frame.epsilon != null ? String(frame.epsilon) : null
  const pertL2 = frame.pert_l2 != null ? Number(frame.pert_l2).toFixed(4) : null
  const iterations = frame.iterations ?? null
  const frameId = String(latestFrame?.frame_id ?? '—')
  const flipped = cleanPred !== attackPred

  // Attacked-panel header: DeepFool shows L2, others show epsilon
  const attackedLabel =
    attackType === 'DeepFool'
      ? `DeepFool${pertL2 ? ` L2=${pertL2}` : ''}`
      : `${attackType}${epsilon ? ` e=${epsilon}` : ''}`

  return (
    <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Frame Comparison — Clean vs Attacked
        </span>
        <div className="flex items-center gap-2">
          {running && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
          {Selector}
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Clean frame */}
        <div className="rounded-lg overflow-hidden border border-slate-700/30">
          <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-mono px-2 py-1 border-b border-slate-700/30">
            Clean Input
          </div>
          <div className="h-28 bg-slate-900 flex items-center justify-center text-slate-700 text-xs">
            {frame.clean_image ? (
              <img
                src={`data:image/jpeg;base64,${frame.clean_image}`}
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
            {attackedLabel}
          </div>
          <div className="h-28 bg-slate-900 flex items-center justify-center text-slate-700 text-xs">
            {frame.attack_image ? (
              <img
                src={`data:image/jpeg;base64,${frame.attack_image}`}
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

      {/* Fixed height, always mounted — only the content/colour changes on flip.
          Conditionally mounting this box made the card's height (and every
          panel below it) jump every ~1s as the live stream flipped in/out. */}
      <div
        className={`mt-3 h-9 flex items-center gap-2 px-3 rounded-lg text-[11px] font-mono transition-colors duration-200 ${
          flipped
            ? 'bg-red-500/10 border border-red-500/20 text-red-400'
            : 'bg-slate-900/30 border border-slate-700/20 text-slate-600'
        }`}
      >
        {flipped ? (
          <>
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              PREDICTION FLIPPED: {cleanPred.toUpperCase()} → {attackPred.toUpperCase()}
              {attackType === 'DeepFool' && iterations != null && ` (${iterations} iters)`}
            </span>
          </>
        ) : (
          <span>Prediction stable</span>
        )}
      </div>
    </div>
  )
}
