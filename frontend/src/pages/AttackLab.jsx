import { useState, useRef, useEffect } from 'react'
import { Zap, Play, Upload, ImageIcon, X, ArrowRight } from 'lucide-react'
import { runFGSM, runPGD, getSamples } from '../api/client'
import { useAttack } from '../context/AttackContext'
import { wsClient } from '../api/websocket'
import ImagePanel from '../components/ImagePanel'

// Static display info; enabled/epsilon come from shared context (synced with the sidebar)
const ATTACK_META = [
  { id: 'fgsm', name: 'FGSM', hasEpsilon: true,
    description: 'Fast Gradient Sign Method — single-step gradient-based attack that perturbs pixels in the direction of the loss gradient.' },
  { id: 'pgd', name: 'PGD', hasEpsilon: true, extra: 'Iterations: 40',
    description: 'Projected Gradient Descent — iterative version of FGSM that takes multiple small steps, projecting back into the epsilon ball after each step.' },
  { id: 'labelflip', name: 'LABELFLIP', hasEpsilon: false, extra: 'Flip rate: 10%',
    description: 'Label Flipping Poisoning — corrupts a fraction of training labels to degrade model reliability from within.' },
  { id: 'backdoor', name: 'BACKDOOR', hasEpsilon: false,
    description: 'Backdoor Attack — implants a hidden trigger pattern so the model misclassifies whenever the trigger appears at inference.' },
]

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
  const enabled = attack.enabled
  const epsilon = attack.epsilon ?? 0.1
  return (
    <div className={`rounded-xl border p-6 flex flex-col gap-4 transition-colors ${enabled ? 'bg-[#1a1f2e] border-slate-600' : 'bg-[#12151f] border-slate-700'}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wide text-white">{meta.name}</span>
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
  const handleToggle = (id) => {
    const willEnable = !attacks[id].enabled
    toggleAttack(id)
    wsClient.send({ type: 'attack_control', attack: id, enabled: willEnable, epsilon: attacks[id].epsilon })
  }
  const handleEpsilon = (id, val) => {
    setEpsilon(id, val)
    wsClient.send({ type: 'epsilon_change', attack: id, epsilon: val })
  }

  const runAttack = async () => {
    if (!cleanInput) return
    const usePgd = attacks.pgd.enabled
    const id = usePgd ? 'pgd' : attacks.fgsm.enabled ? 'fgsm' : null
    if (!id) return
    setRunning(true); setError(null)
    try {
      const epsilon = attacks[id].epsilon ?? 0.1
      const b64 = stripDataUrl(cleanInput.image)
      const res = usePgd ? await runPGD(b64, epsilon, attacks.pgd.iterations ?? 40) : await runFGSM(b64, epsilon)
      const d = res.data
      setLastAttackResult({
        attackImage: `data:image/jpeg;base64,${d.attack_image}`,
        cleanImage: cleanInput.image,
        cleanPred: d.clean_pred,
        cleanConf: d.clean_conf,
        attackPred: d.attack_pred,
        attackConf: d.attack_conf,
        epsilon: Number(d.epsilon).toFixed(2),
        attackType: usePgd ? 'PGD' : 'FGSM',
        fileName: cleanInput.name,
      })
    } catch (e) {
      setError(e?.message || 'request failed')
    } finally {
      setRunning(false)
    }
  }

  const adversarialImage = lastAttackResult?.attackImage || null
  const resultInfo = lastAttackResult
    ? {
        attackType: lastAttackResult.attackType,
        epsilon: lastAttackResult.epsilon,
        flipped: lastAttackResult.cleanPred !== lastAttackResult.attackPred,
        cleanPred: lastAttackResult.cleanPred,
        cleanConf: (lastAttackResult.cleanConf * 100).toFixed(1),
        attackPred: lastAttackResult.attackPred,
        attackConf: (lastAttackResult.attackConf * 100).toFixed(1),
      }
    : null

  const canRun = (attacks.fgsm.enabled || attacks.pgd.enabled) && cleanInput && !running

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
          <Zap className="w-6 h-6 text-red-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Attack Lab</h2>
          <p className="text-slate-400 text-sm">Upload or pick a frame, run FGSM/PGD, compare clean vs attacked</p>
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
                    &nbsp;·&nbsp; {resultInfo.attackType} &nbsp;·&nbsp; ε = <span className="font-mono">{resultInfo.epsilon}</span>
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
          {!cleanInput ? 'Upload or pick a test image to run attacks' : 'Runs FGSM/PGD on the backend (FGSM/PGD toggles sync with the sidebar)'}
        </span>
      </div>
    </div>
  )
}
