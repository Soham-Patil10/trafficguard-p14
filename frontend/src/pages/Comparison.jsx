import { useState, useRef, useEffect } from 'react'
import { GitCompare, Play, Upload, ImageIcon, X, AlertTriangle } from 'lucide-react'
import { compareModels, getCompareStatus, getSamples } from '../api/client'
import ImagePanel from '../components/ImagePanel'

const stripDataUrl = (d) => (d && d.includes(',') ? d.split(',')[1] : d)
const POISON_RATES = ['10', '20', '40']

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
      className={`cursor-pointer border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 py-10 transition-colors ${dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500 bg-[#12151f]'}`}
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

function ModelCard({ title, pred, conf, tone }) {
  const toneClasses = tone === 'clean'
    ? 'bg-blue-500/10 border-blue-500/30'
    : 'bg-red-500/10 border-red-500/30'
  const predColor = tone === 'clean' ? 'text-blue-300' : 'text-red-300'
  return (
    <div className={`rounded-xl border p-5 ${toneClasses}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</p>
      {pred ? (
        <div className="mt-2">
          <p className={`text-2xl font-bold ${predColor}`}>{pred}</p>
          <p className="text-sm text-slate-400 mt-1 font-mono">{(conf * 100).toFixed(1)}% confidence</p>
        </div>
      ) : (
        <p className="mt-2 text-slate-500 text-sm">Not available</p>
      )}
    </div>
  )
}

export default function Comparison() {
  const [cleanInput, setCleanInput] = useState(null) // { image, name }
  const [rate, setRate] = useState('20')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [samples, setSamples] = useState([])
  // Per-rate availability, e.g. { "10": {checkpoint_loaded:true,...}, "20": {...}, "40": {...} }
  const [rateStatus, setRateStatus] = useState({})

  useEffect(() => {
    getSamples().then((r) => setSamples(r.data?.samples || [])).catch(() => setSamples([]))
    getCompareStatus()
      .then((r) => setRateStatus(r.data?.poisoned_rates || {}))
      .catch(() => setRateStatus({}))
  }, [])

  const currentRateAvailable = !!rateStatus[rate]?.checkpoint_loaded

  const setImage = (image, name) => { setCleanInput({ image, name }); setResult(null); setError(null) }
  const pickSample = (s) => setImage(s.image, s.name)
  const clearImage = () => { setCleanInput(null); setResult(null); setError(null) }
  const changeRate = (newRate) => { setRate(newRate); setResult(null); setError(null) }

  const runComparison = async () => {
    if (!cleanInput) return
    setRunning(true); setError(null)
    try {
      const res = await compareModels(stripDataUrl(cleanInput.image), rate)
      const d = res.data
      setResult({
        cleanPred: d.clean_pred,
        cleanConf: d.clean_conf,
        poisonedPred: d.poisoned_pred,
        poisonedConf: d.poisoned_conf,
        disagree: d.disagree,
        poisonedLoaded: d.poisoned_loaded,
        rate: d.rate,
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
        <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
          <GitCompare className="w-6 h-6 text-indigo-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Model Comparison</h2>
          <p className="text-slate-400 text-sm">Run one image through the clean model and the label-flipped (poisoned) model, side by side</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Poison rate</label>
          <select
            value={rate}
            onChange={(e) => changeRate(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200"
          >
            {POISON_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%{!rateStatus[r]?.checkpoint_loaded ? ' (unavailable)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!currentRateAvailable && (
        <div className="rounded-lg p-4 border bg-amber-500/10 border-amber-500/30 text-sm text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No {rate}% poisoned model loaded</p>
            <p className="text-slate-400 mt-1">
              Place that label-flip checkpoint at <span className="font-mono">model/checkpoints/poisoned_{rate}pct.pt</span> (or
              set the <span className="font-mono">TG_POISONED_{rate}</span> env var) and restart the backend. The clean model still runs.
            </p>
          </div>
        </div>
      )}

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
                  className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${cleanInput?.name === s.name ? 'border-indigo-400' : 'border-slate-700 hover:border-slate-500'}`}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ImagePanel label="Input" src={cleanInput.image} badge="Clean input" badgeColor="bg-indigo-500/20 text-indigo-400"
                sub={cleanInput.name} />
              <ModelCard title="Clean Model" pred={result?.cleanPred} conf={result?.cleanConf} tone="clean" />
              <ModelCard title={`Poisoned Model (${rate}%)`} pred={result?.poisonedPred} conf={result?.poisonedConf} tone="poison" />
            </div>

            {error && (
              <div className="rounded-lg p-4 border bg-red-500/10 border-red-500/30 text-sm text-red-400">
                Could not reach the backend ({error}). Is uvicorn running on http://localhost:8000?
              </div>
            )}

            {result && !error && result.poisonedLoaded && (
              <div className={`rounded-lg p-4 border text-sm ${result.disagree ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-slate-700/30 border-slate-600 text-slate-300'}`}>
                <p className="font-semibold">
                  {result.disagree ? 'Poisoning changed the prediction' : 'Both models agree'}
                </p>
                <p className="text-slate-400 mt-1">
                  clean: <span className="text-blue-300">{result.cleanPred}</span>
                  &nbsp;·&nbsp; poisoned: <span className="text-red-300">{result.poisonedPred}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={runComparison}
          disabled={!cleanInput || !currentRateAvailable || running}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {running ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
          {running ? 'Running...' : 'Run Comparison'}
        </button>
        <span className="text-slate-500 text-sm">
          {!cleanInput
            ? 'Upload or pick a test image to compare the two models'
            : !currentRateAvailable
            ? `${rate}% poisoned model isn't loaded — pick a different rate`
            : `Runs the same image through the clean model and the ${rate}% poisoned model`}
        </span>
      </div>
    </div>
  )
}
