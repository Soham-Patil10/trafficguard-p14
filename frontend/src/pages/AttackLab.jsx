import { useState, useRef, useCallback } from 'react'
import { useAttack } from '../context/AttackContext'
import { Zap, Play, Loader2, Upload, ImageIcon, X, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'
import { runFGSM, runPGD } from '../api/client'

const ATTACK_INFO = {
  fgsm: {
    desc: 'Fast Gradient Sign Method — single-step gradient-based attack that perturbs pixels in the direction of the loss gradient.',
    params: ['epsilon'],
  },
  pgd: {
    desc: 'Projected Gradient Descent — iterative version of FGSM that takes multiple small steps, projecting back into the epsilon ball after each step.',
    params: ['epsilon', 'iterations'],
  },
  labelflip: {
    desc: 'Label Flipping Poisoning — corrupts a fraction of training labels to degrade model reliability from within.',
    params: ['rate'],
  },
  backdoor: {
    desc: 'Backdoor Attack — implants a hidden trigger pattern in training data so the model misclassifies whenever the trigger appears at inference time.',
    params: [],
  },
}

const PRED_COLORS = {
  Low: '#34d399',
  Medium: '#f59e0b',
  High: '#ef4444',
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function ImagePanel({ label, labelColor, src, pred, conf, placeholder }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-slate-700/40 bg-slate-900/60">
      {/* label bar */}
      <div className={`flex items-center gap-1.5 px-3 py-2 border-b border-slate-700/30 ${labelColor}`}>
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest">{label}</span>
      </div>

      {/* image area */}
      <div className="relative flex items-center justify-center h-48 bg-slate-950/40">
        {src ? (
          <img src={src} alt={label} className="max-h-48 w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-700">
            <ImageIcon className="w-8 h-8" />
            <span className="text-[10px] font-mono">{placeholder}</span>
          </div>
        )}
      </div>

      {/* prediction badge */}
      <div className="px-3 py-2 border-t border-slate-700/30 min-h-[2rem] flex items-center">
        {pred ? (
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-mono font-bold tracking-wide"
              style={{ color: PRED_COLORS[pred] ?? '#94a3b8' }}
            >
              {pred.toUpperCase()}
            </span>
            {conf !== undefined && (
              <span className="text-[11px] font-mono text-slate-500">{(conf * 100).toFixed(1)}%</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] font-mono text-slate-700">—</span>
        )}
      </div>
    </div>
  )
}

export default function AttackLab() {
  const { attacks, toggleAttack, setEpsilon } = useAttack()
  const [running, setRunning] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewURL, setPreviewURL] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  const activeAttack = Object.entries(attacks).find(([, v]) => v.enabled)?.[0] ?? 'fgsm'

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setSelectedFile(file)
    setResult(null)
    setError(null)
    const url = await fileToDataURL(file)
    setPreviewURL(url)
  }, [])

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  function handleInputChange(e) {
    handleFile(e.target.files[0])
  }

  function clearImage() {
    setSelectedFile(null)
    setPreviewURL(null)
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleRunAttack() {
    if (!selectedFile) return
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const b64 = await fileToBase64(selectedFile)
      const attack = attacks[activeAttack]
      let res

      if (activeAttack === 'fgsm') {
        res = await runFGSM(b64, attack.epsilon)
      } else if (activeAttack === 'pgd') {
        res = await runPGD(b64, attack.epsilon, attack.iterations ?? 40)
      } else {
        throw new Error(`Attack type "${activeAttack}" requires backend support — no image input needed.`)
      }

      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail ?? e.message ?? 'Attack failed')
    } finally {
      setRunning(false)
    }
  }

  const canRun = selectedFile && !running && (activeAttack === 'fgsm' || activeAttack === 'pgd')

  const cleanSrc = result?.clean_image
    ? `data:image/jpeg;base64,${result.clean_image}`
    : previewURL ?? null

  const attackSrc = result?.attack_image
    ? `data:image/jpeg;base64,${result.attack_image}`
    : null

  const predFlipped = result?.clean_pred && result?.attack_pred && result.clean_pred !== result.attack_pred

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25">
          <Zap className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Attack Lab</h2>
          <p className="text-xs text-slate-500">
            Configure an attack, upload an image, and run it against the traffic classification model
          </p>
        </div>
      </div>

      {/* Attack config cards */}
      <div className="space-y-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-1">
          Attack Configuration
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Object.entries(ATTACK_INFO).map(([key, info]) => {
            const attack = attacks[key]
            if (!attack) return null
            const isActive = attack.enabled
            return (
              <div
                key={key}
                className={`rounded-xl border p-4 transition-all duration-300 ${
                  isActive
                    ? 'bg-red-500/5 border-red-500/30'
                    : 'bg-slate-800/60 border-slate-700/40'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-200 uppercase font-mono tracking-wider">
                    {key}
                  </h3>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleAttack(key)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600" />
                  </label>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  {info.desc}
                </p>
                {info.params.includes('epsilon') && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Epsilon</span>
                      <span className="text-red-400">{attack.epsilon.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.50"
                      step="0.01"
                      value={attack.epsilon}
                      onChange={e => setEpsilon(key, parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-0.5">
                      <span>0.01</span><span>0.25</span><span>0.50</span>
                    </div>
                  </div>
                )}
                {info.params.includes('iterations') && attack.iterations !== undefined && (
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    Iterations: <span className="text-slate-300">{attack.iterations}</span>
                  </div>
                )}
                {info.params.includes('rate') && attack.rate !== undefined && (
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    Flip rate: <span className="text-slate-300">{attack.rate}%</span>
                  </div>
                )}
                {(key === 'labelflip' || key === 'backdoor') && (
                  <div className="mt-2 text-[10px] font-mono text-slate-600 px-2 py-1 bg-slate-700/30 rounded leading-relaxed">
                    Poisoning — no image input needed
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Image row — input | arrow | result */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Image Comparison
        </div>

        <div className="flex items-stretch gap-3">
          {/* Input image */}
          <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-slate-700/40 bg-slate-900/60">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30 bg-slate-800/40">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-slate-400">
                Input
              </span>
              {previewURL && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Replace"
                  >
                    <ImageIcon className="w-3 h-3" />
                  </button>
                  <button
                    onClick={clearImage}
                    className="p-1 rounded hover:bg-red-900/40 text-slate-500 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {!previewURL ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center h-48 cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? 'bg-red-500/8'
                    : 'hover:bg-slate-800/40'
                }`}
                style={{ border: dragOver ? '2px dashed rgba(248,113,113,0.5)' : '2px dashed transparent' }}
              >
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-slate-500" />
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Drop or click to upload</span>
                  <span className="text-[10px] text-slate-600">PNG · JPG · WEBP</span>
                </div>
              </div>
            ) : (
              <div className="relative flex items-center justify-center h-48 bg-slate-950/40">
                <img src={previewURL} alt="Input" className="max-h-48 w-full object-contain" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950/80 to-transparent px-2 py-1.5">
                  <span className="text-[10px] font-mono text-slate-500 truncate block">{selectedFile?.name}</span>
                </div>
              </div>
            )}

            <div className="px-3 py-2 border-t border-slate-700/30 min-h-[2rem] flex items-center">
              <span className="text-[10px] font-mono text-slate-600">
                {previewURL ? 'Ready' : 'No image selected'}
              </span>
            </div>
          </div>

          {/* Arrow divider */}
          <div className="flex flex-col items-center justify-center gap-1 shrink-0 pt-10">
            <div className={`p-2 rounded-full border transition-all duration-300 ${
              running
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : result
                ? 'bg-slate-700/50 border-slate-600/40 text-slate-400'
                : 'bg-slate-800/60 border-slate-700/30 text-slate-600'
            }`}>
              {running
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ArrowRight className="w-4 h-4" />
              }
            </div>
            {running && (
              <span className="text-[9px] font-mono text-red-400 whitespace-nowrap">attacking</span>
            )}
          </div>

          {/* Result image */}
          <ImagePanel
            label="Adversarial"
            labelColor="bg-red-500/8 text-red-400"
            src={attackSrc}
            pred={result?.attack_pred}
            conf={result?.attack_conf}
            placeholder={running ? 'computing...' : 'run attack to see result'}
          />
        </div>

        {/* Status banner */}
        {(error || predFlipped || (result?.clean_pred && result?.attack_pred && !predFlipped)) && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-mono border ${
            error
              ? 'bg-red-500/8 border-red-500/20 text-red-400'
              : predFlipped
              ? 'bg-red-500/8 border-red-500/20 text-red-400'
              : 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
          }`}>
            {error ? (
              <><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}</>
            ) : predFlipped ? (
              <><AlertTriangle className="w-3.5 h-3.5 shrink-0" />PREDICTION FLIPPED: {result.clean_pred.toUpperCase()} → {result.attack_pred.toUpperCase()}</>
            ) : (
              <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />PREDICTION HELD: model defended — {result?.clean_pred?.toUpperCase()}</>
            )}
          </div>
        )}

        {/* Metrics row */}
        {result?.asr !== undefined && (
          <div className="flex items-center gap-6 px-1">
            <div className="text-[11px] font-mono">
              <span className="text-slate-500">ASR </span>
              <span className="text-red-400 font-bold">{result.asr.toFixed(1)}%</span>
            </div>
            {result.perturbation_norm !== undefined && (
              <div className="text-[11px] font-mono">
                <span className="text-slate-500">‖δ‖₂ </span>
                <span className="text-sky-400 font-bold">{result.perturbation_norm.toFixed(4)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Run button row */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleRunAttack}
          disabled={!canRun}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            canRun
              ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30'
              : 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
          }`}
        >
          {running
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Play className="w-4 h-4" />
          }
          {running ? 'Running Attack...' : 'Run Attack'}
        </button>
        {!selectedFile && (
          <span className="text-xs text-slate-500">Upload an image above to enable</span>
        )}
        {selectedFile && !canRun && !running && (
          <span className="text-xs text-slate-500">
            {activeAttack === 'labelflip' || activeAttack === 'backdoor'
              ? 'Select FGSM or PGD for image-based attacks'
              : 'Enable an attack above'}
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
