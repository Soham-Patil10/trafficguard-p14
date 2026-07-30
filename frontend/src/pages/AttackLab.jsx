import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Play, Upload, ImageIcon, X, ArrowRight } from 'lucide-react'
import { runFGSM, runPGD, runDeepFool, getSamples } from '../api/client'
import { useAttack } from '../context/AttackContext'
import { wsClient } from '../api/websocket'
import ImagePanel from '../components/ImagePanel'

// Static display info; enabled/epsilon come from shared context (synced with the sidebar)
const ATTACK_META = [
  { id: 'fgsm', name: 'FGSM', hasEpsilon: true, kind: 'evasion',
    description: 'Fast Gradient Sign Method — single-step gradient-based attack that perturbs pixels in the direction of the loss gradient.' },
  { id: 'pgd', name: 'PGD', hasEpsilon: true, extra: 'Iterations: 40', kind: 'evasion',
    description: 'Projected Gradient Descent — iterative version of FGSM that takes multiple small steps, projecting back into the epsilon ball after each step.' },
  // DeepFool has NO epsilon: it searches for the minimal perturbation itself and
  // reports the resulting L2 as a robustness score.
  { id: 'deepfool', name: 'DeepFool', hasEpsilon: false, extra: 'Minimal perturbation · reports L2', kind: 'evasion',
    description: 'DeepFool — iteratively steps to the nearest decision boundary to find the smallest perturbation that flips the prediction. Reports the minimal L2 change instead of taking an epsilon budget.' },
]

// Poisoning is a TRAINING-time attack — it cannot run on a single image here,
// so it's rendered as its own card with a button (see PoisonCard) instead of
// a toggle in ATTACK_META.
const POISON_META = {
  name: 'Label Flipping',
  description: 'Label Flipping Poisoning — corrupts a fraction of training labels to degrade model reliability from within. Runs offline during training, not per-image.',
}

// Evasion attacks in priority order (first enabled one wins)
const EVASION_PRIORITY = ['pgd', 'deepfool', 'fgsm']

const stripDataUrl = (d) => (d && d.includes(',') ? d.split(',')[1] : d)

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${enabled ? 'bg-red-500' : 'bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  )
}

function AttackCard({ meta, attack, onToggle, onEpsilon }) {
  // Defensive: an attack id may not exist in context yet
  const a = attack || {}
  const enabled = !!a.enabled
  const epsilon = a.epsilon ?? 0.1
  return (
    <div className={`rounded-xl border p-6 flex flex-col gap-4 transition-colors ${enabled ? 'bg-[#1a1f2e] border-slate-600' : 'bg-[#12151f] border-slate-700'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wide text-white">{meta.name}</span>
          {meta.kind === 'poisoning' && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              poisoning
            </span>
          )}
        </div>
        <Toggle enabled={enabled} onChange={() => onToggle(meta.id)} />
      </div>
      <p className="text-slate-400 text-sm leading-relaxed">{meta.description}</p>
      {meta.hasEpsilon && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-300">Epsilon</span>
            <span className="text-red-400 font-mono">{epsilon.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0} max={0.5} step={0.01} value={epsilon}
            onChange={(e) => onEpsilon(meta.id, parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, #ef4444 ${(epsilon / 0.5) * 100}%, #374151 ${(epsilon / 0.5) * 100}%)` }}
          />
        </div>
      )}
      {meta.extra && <p className="text-slate-500 text-sm">{meta.extra}</p>}
    </div>
  )
}

function PoisonCard({ meta, onCompare }) {
  return (
    <div className="rounded-xl border p-6 flex flex-col gap-4 bg-[#12151f] border-slate-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-wide text-white">{meta.name}</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            poisoning
          </span>
        </div>
      </div>
      <p className="text-slate-400 text-sm leading-relaxed flex-1">{meta.description}</p>
      <button
        onClick={onCompare}
        className="flex items-center justify-center gap-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        <ArrowRight className="w-4 h-4" /> Compare Poisoned Model
      </button>
    </div>
  )
}

function ImageUploadZone({ onImageLoaded }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()
  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => onImageLoaded(e.target.result, file.name)
    reader.readAsDataURL(file)
  }
  return (
    <div
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
      className={`cursor-pointer border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-10 transition-colors ${dragging ? 'border-red-400 bg-red-500/10' : 'border-slate-600 hover:border-slate-500 bg-[#12151f]'}`}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
        <Upload className="w-5 h-5 text-slate-400" />
      </div>
      <div className="text-center">
        <p className="text-slate-300 font-medium">Drop image here or click to upload</p>
        <p className="text-slate-500 text-sm mt-1">PNG, JPG, WEBP supported</p>
      </div>
    </div>
  )
}

export default function AttackLab() {
  const navigate = useNavigate()
  const {
    attacks, toggleAttack, setEpsilon,
    cleanInput, setCleanInput,
    lastAttackResult, setLastAttackResult,
  } = useAttack()

  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [samples, setSamples] = useState([])

  useEffect(() => {
    getSamples().then((r) => setSamples(r.data?.samples || [])).catch(() => setSamples([]))
  }, [])

  // The uploaded image persists in context; the attack output persists in lastAttackResult.
  const setImage = (image, name) => {
    setCleanInput({ image, name })
    setLastAttackResult(null) // new image -> reset previous attack output
    setError(null)
  }
  const pickSample = (s) => setImage(s.image, s.name)
  const clearImage = () => { setCleanInput(null); setLastAttackResult(null); setError(null) }

  // Keep the sidebar in sync: toggling/sliding here updates shared context + the WS.
  // Only one attack can be active at a time, so turning one on implicitly turns
  // off whichever other attack was previously enabled — the WS needs both events.
  const handleToggle = (id) => {
    const willEnable = !attacks[id]?.enabled
    const othersToDisable = willEnable
      ? Object.keys(attacks).filter((key) => key !== id && attacks[key]?.enabled)
      : []

    toggleAttack(id)

    wsClient.send({ type: 'attack_control', attack: id, enabled: willEnable, epsilon: attacks[id]?.epsilon })
    othersToDisable.forEach((key) => {
      wsClient.send({ type: 'attack_control', attack: key, enabled: false, epsilon: attacks[key]?.epsilon })
    })
  }
  const handleEpsilon = (id, val) => {
    setEpsilon(id, val)
    wsClient.send({ type: 'epsilon_change', attack: id, epsilon: val })
  }

  // Which evasion attack will actually run (poisoning isn't toggle-based — it's training-time)
  const selectedAttackId = EVASION_PRIORITY.find((id) => attacks[id]?.enabled) || null

  const runAttack = async () => {
    if (!cleanInput || !selectedAttackId) return
    setRunning(true); setError(null)
    try {
      const b64 = stripDataUrl(cleanInput.image)
      let res, attackType

      if (selectedAttackId === 'pgd') {
        res = await runPGD(b64, attacks.pgd.epsilon ?? 0.1, attacks.pgd.iterations ?? 40)
        attackType = 'PGD'
      } else if (selectedAttackId === 'deepfool') {
        // DeepFool takes max_iter, NOT epsilon — it finds the minimal perturbation itself
        res = await runDeepFool(b64, attacks.deepfool?.maxIter ?? 50)
        attackType = 'DeepFool'
      } else {
        res = await runFGSM(b64, attacks.fgsm.epsilon ?? 0.1)
        attackType = 'FGSM'
      }

      const d = res.data
      setLastAttackResult({
        attackImage: `data:image/jpeg;base64,${d.attack_image}`,
        cleanImage: cleanInput.image,
        cleanPred: d.clean_pred,
        cleanConf: d.clean_conf,
        attackPred: d.attack_pred,
        attackConf: d.attack_conf,
        // FGSM/PGD report epsilon; DeepFool reports pert_l2 + iterations instead
        epsilon: d.epsilon != null ? Number(d.epsilon).toFixed(2) : null,
        pertL2: d.pert_l2 != null ? Number(d.pert_l2).toFixed(4) : null,
        iterations: d.iterations ?? null,
        attackType,
        fileName: cleanInput.name,
      })
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'request failed')
    } finally {
      setRunning(false)
    }
  }

  const adversarialImage = lastAttackResult?.attackImage || null
  const resultInfo = lastAttackResult
    ? {
        attackType: lastAttackResult.attackType,
        epsilon: lastAttackResult.epsilon,
        pertL2: lastAttackResult.pertL2,
        iterations: lastAttackResult.iterations,
        flipped: lastAttackResult.cleanPred !== lastAttackResult.attackPred,
        cleanPred: lastAttackResult.cleanPred,
        cleanConf: (lastAttackResult.cleanConf * 100).toFixed(1),
        attackPred: lastAttackResult.attackPred,
        attackConf: (lastAttackResult.attackConf * 100).toFixed(1),
      }
    : null

  const canRun = !!selectedAttackId && cleanInput && !running

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
          <Zap className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Attack Lab</h2>
          <p className="text-slate-400 text-sm">Upload or pick a frame, run FGSM/PGD/DeepFool, compare clean vs attacked</p>
        </div>
      </div>

      <div className="bg-[#12151f] border border-slate-700 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Target Image</h3>
          {cleanInput && (
            <button onClick={clearImage} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>

        {samples.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Or pick a test image:</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {samples.map((s) => (
                <button
                  key={s.name}
                  onClick={() => pickSample(s)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${cleanInput?.name === s.name ? 'border-red-400' : 'border-slate-700 hover:border-slate-500'}`}
                  title={s.name}
                >
                  <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!cleanInput ? (
          <ImageUploadZone onImageLoaded={setImage} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800 rounded-lg px-3 py-2">
              <ImageIcon className="w-4 h-4" />
              <span className="truncate">{cleanInput.name}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImagePanel label="Before — Clean" src={cleanInput.image} badge="Clean" badgeColor="bg-blue-500/20 text-blue-400"
                sub={resultInfo ? `${resultInfo.cleanPred} · ${resultInfo.cleanConf}%` : null} />
              <ImagePanel label="After — Attacked" src={adversarialImage} badge={adversarialImage ? 'Perturbed' : null} badgeColor="bg-red-500/20 text-red-400"
                sub={resultInfo ? `${resultInfo.attackPred} · ${resultInfo.attackConf}%` : null} />
            </div>

            {error && (
              <div className="rounded-lg p-4 border bg-red-500/10 border-red-500/30 text-sm text-red-400">
                Could not reach the backend ({error}). Is uvicorn running on http://localhost:8000?
              </div>
            )}

            {resultInfo && !error && (
              <>
                <div className={`rounded-lg p-4 border text-sm ${resultInfo.flipped ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-slate-700/30 border-slate-600 text-slate-300'}`}>
                  <p className="font-semibold">{resultInfo.flipped ? 'Attack changed the prediction' : 'Attack did not change the prediction'}</p>
                  <p className="text-slate-400 mt-1">
                    {resultInfo.cleanPred} ({resultInfo.cleanConf}%) → <span className="text-red-300">{resultInfo.attackPred}</span> ({resultInfo.attackConf}%)
                    &nbsp;·&nbsp; {resultInfo.attackType}
                    {resultInfo.attackType === 'DeepFool'
                      ? <> &nbsp;·&nbsp; L2 = <span className="font-mono">{resultInfo.pertL2}</span> &nbsp;·&nbsp; {resultInfo.iterations} iters</>
                      : <> &nbsp;·&nbsp; ε = <span className="font-mono">{resultInfo.epsilon}</span></>}
                  </p>
                </div>
                <div className="rounded-lg p-3 border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-300 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  Attacked image sent to the Defence Lab — open that tab to run the defence.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ATTACK_META.map((meta) => (
          <AttackCard key={meta.id} meta={meta} attack={attacks[meta.id]} onToggle={handleToggle} onEpsilon={handleEpsilon} />
        ))}
        <PoisonCard meta={POISON_META} onCompare={() => navigate('/compare')} />
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={runAttack}
          disabled={!canRun}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {running ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          {running ? 'Running...' : 'Run Attack'}
        </button>
        <span className="text-slate-500 text-sm">
          {!cleanInput
            ? 'Upload or pick a test image to run attacks'
            : selectedAttackId
            ? `Running ${selectedAttackId.toUpperCase()} on the backend`
            : 'Enable an evasion attack (FGSM, PGD or DeepFool) to run'}
        </span>
      </div>
    </div>
  )
}
