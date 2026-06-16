import { useAttack } from '../context/AttackContext'
import { ShieldCheck } from 'lucide-react'

const DEFENCE_INFO = {
  advtrain: {
    desc: 'Trains the model on adversarial examples to improve robustness against perturbation attacks.',
    paper: 'Madry et al., 2018',
  },
  jpeg: {
    desc: 'Compresses input through JPEG encoding/decoding to strip high-frequency adversarial noise.',
    paper: 'Das et al., 2018',
  },
  smooth: {
    desc: 'Applies spatial smoothing (median or bit-depth reduction) to remove fine-grained perturbations.',
    paper: 'Xu et al., 2018',
  },
  rs: {
    desc: 'Certifiable defense: adds Gaussian noise to inputs and votes on predictions, providing a provable robustness radius.',
    paper: 'Cohen et al., 2019',
  },
  ensemble: {
    desc: 'Aggregates predictions from multiple independently trained models to dilute the effect of any single model vulnerability.',
    paper: 'Tramer et al., 2020',
  },
}

export default function Defences() {
  const { defences, toggleDef } = useAttack()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Defence Configurations</h2>
          <p className="text-xs text-slate-500">
            Enable and configure adversarial defense mechanisms
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(DEFENCE_INFO).map(([key, info]) => {
          const defence = defences[key]
          if (!defence) return null
          return (
            <div
              key={key}
              className={`rounded-xl border p-4 transition-all duration-300 ${
                defence.enabled
                  ? 'bg-emerald-500/5 border-emerald-500/25'
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
                    checked={defence.enabled}
                    onChange={() => toggleDef(key)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600" />
                </label>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">
                {info.desc}
              </p>
              <p className="text-[10px] text-slate-600 font-mono">
                Ref: {info.paper}
              </p>
              {defence.enabled && defence.robustAcc !== undefined && (
                <div className="mt-2 px-2 py-1 bg-emerald-500/10 rounded text-[11px] font-mono text-emerald-400 inline-block">
                  Robust Acc: {defence.robustAcc}%
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
