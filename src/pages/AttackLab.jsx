import { useState } from 'react'
import { useAttack } from '../context/AttackContext'
import { Zap, Play, Loader2 } from 'lucide-react'

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

export default function AttackLab() {
  const { attacks, toggleAttack, setEpsilon } = useAttack()
  const [running, setRunning] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/25">
          <Zap className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Attack Lab</h2>
          <p className="text-xs text-slate-500">
            Configure and launch adversarial attacks against the traffic classification model
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(ATTACK_INFO).map(([key, info]) => {
          const attack = attacks[key]
          if (!attack) return null
          return (
            <div
              key={key}
              className={`rounded-xl border p-4 transition-all duration-300 ${
                attack.enabled
                  ? 'bg-red-500/5 border-red-500/25'
                  : 'bg-slate-800/60 border-slate-700/40'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase font-mono">
                  {key}
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attack.enabled}
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
                </div>
              )}
              {info.params.includes('iterations') && attack.iterations !== undefined && (
                <div className="text-[11px] font-mono text-slate-500">
                  Iterations: {attack.iterations}
                </div>
              )}
              {info.params.includes('rate') && attack.rate !== undefined && (
                <div className="text-[11px] font-mono text-slate-500">
                  Flip rate: {attack.rate}%
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => setRunning(true)}
          disabled={running}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {running ? 'Running Attack...' : 'Run Attack'}
        </button>
        <span className="text-xs text-slate-500">
          Executes enabled attacks via FastAPI backend
        </span>
      </div>
    </div>
  )
}
