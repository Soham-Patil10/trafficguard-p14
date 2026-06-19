import { useState, useRef, useCallback, useEffect } from 'react'
import { Zap, Play, Upload, ImageIcon, X, ArrowRight } from 'lucide-react'
import { runFGSM, runPGD, getSamples } from '../api/client'
import { useAttack } from '../context/AttackContext'
import ImagePanel from '../components/ImagePanel'

const initialAttacks = [
  {
    id: 'fgsm',
    name: 'FGSM',
    enabled: true,
    description:
      'Fast Gradient Sign Method — single-step gradient-based attack that perturbs pixels in the direction of the loss gradient.',
    controls: [{ type: 'epsilon', label: 'Epsilon', value: 0.1, min: 0, max: 0.5, step: 0.01 }],
  },
  {
    id: 'pgd',
    name: 'PGD',
    enabled: false,
    description:
      'Projected Gradient Descent — iterative version of FGSM that takes multiple small steps, projecting back into the epsilon ball after each step.',
    controls: [
      { type: 'epsilon', label: 'Epsilon', value: 0.1, min: 0, max: 0.5, step: 0.01 },
      { type: 'info', label: 'Iterations: 40' },
    ],
  },
  {
    id: 'labelflip',
    name: 'LABELFLIP',
    enabled: false,
    description:
      'Label Flipping Poisoning — corrupts a fraction of training labels to degrade model reliability from within.',
    controls: [{ type: 'info', label: 'Flip rate: 10%' }],
  },
  {
    id: 'backdoor',
    name: 'BACKDOOR',
    enabled: false,
    description:
      'Backdoor Attack — implants a hidden trigger pattern in training data so the model misclassifies whenever the trigger appears at inference time.',
    controls: [],
  },
]

const stripDataUrl = (d) => (d && d.includes(',') ? d.split(',')[1] : d)

function Toggle({ enabled, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0 ${
        enabled ? 'bg-red-500' : 'bg-slate-600'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          enabled ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function AttackCard({ attack, onToggle, onSliderChange }) {
  return (
    <div
      className={`rounded-xl border p-6 flex flex-col gap-4 transition-colors ${
        attack.enabled ? 'bg-[#1a1f2e] border-slate-600' : 'bg-[#12151f] border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold tracking-wide text-white">{attack.name}</span>
        <Toggle enabled={attack.enabled} onChange={() => onToggle(attack.id)} />
      </div>
      <p className="text-slate-400 text-sm leading-relaxed">{attack.description}</p>
      {attack.controls.map((ctrl, i) => {
        if (ctrl.type === 'epsilon') {
          return (
            <div key={i} className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">Epsilon</span>
                <span className="text-red-400 font-mono">{ctrl.value.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={ctrl.min}
                max={ctrl.max}
                step={ctrl.step}
                value={ctrl.value}
                onChange={(e) => onSliderChange(attack.id, i, parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #ef4444 ${(ctrl.value / ctrl.max) * 100}%, #374151 ${(ctrl.value / ctrl.max) * 100}%)`,
                }}
              />
            </div>
          )
        }
        if (ctrl.type === 'info') {
          return <p key={i} className="text-slate-500 text-sm">{ctrl.label}</p>
        }
        return null
      })}
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
      className={`cursor-pointer border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-10 transition-colors ${
        dragging ? 'border-red-400 bg-red-500/10' : 'border-slate-600 hover:border-slate-500 bg-[#12151f]'
      }`}
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
  const { setLastAttackResult } = useAttack()
  const [attacks, setAttacks] = useState(initialAttacks)
  const [running, setRunning] = useState(false)
  const [uploadedImage, setUploadedImage] = useState(null) // dataURL
  const [fileName, setFileName] = useState('')
  const [samples, setSamples] = useState([])
  const [adversarialImage, setAdversarialImage] = useState(null)
  const [resultInfo, setResultInfo] = useState(null)

  // Load preset test images from the backend gallery
  useEffect(() => {
    getSamples()
      .then((r) => setSamples(r.data?.samples || []))
      .catch(() => setSamples([]))
  }, [])

  const handleImageLoaded = useCallback((dataUrl, name) => {
    setUploadedImage(dataUrl)
    setFileName(name)
    setAdversarialImage(null)
    setResultInfo(null)
  }, [])

  const pickSample = (s) => handleImageLoaded(s.image, s.name)

  const clearImage = () => {
    setUploadedImage(null); setFileName('')
    setAdversarialImage(null); setResultInfo(null)
  }

  // Attack only: clean image -> adversarial image. Result is handed to the Defence Lab.
  const runAttack = async () => {
    if (!uploadedImage) return
    setRunning(true)
    setAdversarialImage(null); setResultInfo(null)

    try {
      const enabled = attacks.filter((a) => a.enabled)
      const usePgd = enabled.some((a) => a.id === 'pgd')
      const active = enabled.find((a) => a.id === (usePgd ? 'pgd' : 'fgsm')) || enabled[0]
      const epsCtrl = active?.controls.find((c) => c.type === 'epsilon')
      const epsilon = epsCtrl ? epsCtrl.value : 0.1
      const b64 = stripDataUrl(uploadedImage)

      const res = usePgd ? await runPGD(b64, epsilon, 40) : await runFGSM(b64, epsilon)
      const d = res.data
      const attackImg = `data:image/jpeg;base64,${d.attack_image}`

      setAdversarialImage(attackImg)
      const flipped = d.clean_pred !== d.attack_pred
      setResultInfo({
        attackType: usePgd ? 'PGD' : 'FGSM',
        epsilon: Number(d.epsilon).toFixed(2),
        flipped,
        cleanPred: d.clean_pred,
        cleanConf: (d.clean_conf * 100).toFixed(1),
        attackPred: d.attack_pred,
        attackConf: (d.attack_conf * 100).toFixed(1),
      })

      // Hand off to the Defence Lab via shared context
      setLastAttackResult({
        attackImage: attackImg,
        cleanImage: uploadedImage,
        cleanPred: d.clean_pred,
        cleanConf: d.clean_conf,
        attackPred: d.attack_pred,
        attackConf: d.attack_conf,
        epsilon: Number(d.epsilon).toFixed(2),
        attackType: usePgd ? 'PGD' : 'FGSM',
        fileName,
      })
    } catch (e) {
      setResultInfo({ error: e?.message || 'request failed' })
    } finally {
      setRunning(false)
    }
  }

  const toggleAttack = (id) =>
    setAttacks((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)))

  const updateSlider = (id, controlIndex, value) =>
    setAttacks((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        return { ...a, controls: a.controls.map((c, i) => (i === controlIndex ? { ...c, value } : c)) }
      })
    )

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
          {uploadedImage && (
            <button onClick={clearImage} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition-colors">
              <X className="w-4 h-4" /> Clear
            </button>
          )}
        </div>

        {/* Preset test-image gallery */}
        {samples.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Or pick a test image:</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {samples.map((s) => (
                <button
                  key={s.name}
                  onClick={() => pickSample(s)}
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                    fileName === s.name ? 'border-red-400' : 'border-slate-700 hover:border-slate-500'
                  }`}
                  title={s.name}
                >
                  <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {!uploadedImage ? (
          <ImageUploadZone onImageLoaded={handleImageLoaded} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800 rounded-lg px-3 py-2">
              <ImageIcon className="w-4 h-4" />
              <span className="truncate">{fileName}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImagePanel label="Before — Clean" src={uploadedImage} badge="Clean" badgeColor="bg-blue-500/20 text-blue-400"
                sub={resultInfo && !resultInfo.error ? `${resultInfo.cleanPred} · ${resultInfo.cleanConf}%` : null} />
              <ImagePanel label="After — Attacked" src={adversarialImage} badge={adversarialImage ? 'Perturbed' : null} badgeColor="bg-red-500/20 text-red-400"
                sub={resultInfo && !resultInfo.error ? `${resultInfo.attackPred} · ${resultInfo.attackConf}%` : null} />
            </div>

            {resultInfo && resultInfo.error && (
              <div className="rounded-lg p-4 border bg-red-500/10 border-red-500/30 text-sm text-red-400">
                Could not reach the backend ({resultInfo.error}). Is uvicorn running on http://localhost:8000?
              </div>
            )}

            {resultInfo && !resultInfo.error && (
              <>
                <div className={`rounded-lg p-4 border text-sm ${
                  resultInfo.flipped ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-slate-700/30 border-slate-600 text-slate-300'
                }`}>
                  <p className="font-semibold">
                    {resultInfo.flipped ? 'Attack changed the prediction' : 'Attack did not change the prediction'}
                  </p>
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
        {attacks.map((attack) => (
          <AttackCard key={attack.id} attack={attack} onToggle={toggleAttack} onSliderChange={updateSlider} />
        ))}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={runAttack}
          disabled={running || !attacks.some((a) => a.enabled) || !uploadedImage}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {running ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          {running ? 'Running...' : 'Run Attack'}
        </button>
        <span className="text-slate-500 text-sm">
          {!uploadedImage ? 'Upload or pick a test image to run attacks' : 'Runs FGSM/PGD on the backend'}
        </span>
      </div>
    </div>
  )
}
