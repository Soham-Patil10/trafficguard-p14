import { Brain } from 'lucide-react'
import { useAttack } from '../context/AttackContext'

export default function ModelPage() {
  const { metrics } = useAttack()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25">
          <Brain className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Model Information</h2>
          <p className="text-xs text-slate-500">
            Architecture, training details, and baseline metrics
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Architecture
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Model</span>
              <span className="text-slate-200 font-mono">ResNet-50</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Task</span>
              <span className="text-slate-200 font-mono">Traffic Congestion Classification</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Classes</span>
              <span className="text-slate-200 font-mono">Low, Medium, High</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Input Size</span>
              <span className="text-slate-200 font-mono">224 x 224 x 3</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Dataset</span>
              <span className="text-slate-200 font-mono">CCTV Traffic Frames</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Baseline Metrics
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Clean Accuracy</span>
                <span className="text-emerald-400 font-mono">{metrics.cleanAcc}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${metrics.cleanAcc}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Robust Accuracy</span>
                <span className="text-amber-400 font-mono">{metrics.robustAcc}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${metrics.robustAcc}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Attack Success Rate</span>
                <span className="text-red-400 font-mono">{metrics.asr}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all"
                  style={{ width: `${metrics.asr}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
            Training Configuration
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-500 block text-xs">Optimizer</span>
              <span className="text-slate-200 font-mono">SGD + Momentum</span>
            </div>
            <div>
              <span className="text-slate-500 block text-xs">Learning Rate</span>
              <span className="text-slate-200 font-mono">0.01</span>
            </div>
            <div>
              <span className="text-slate-500 block text-xs">Epochs</span>
              <span className="text-slate-200 font-mono">90</span>
            </div>
            <div>
              <span className="text-slate-500 block text-xs">Batch Size</span>
              <span className="text-slate-200 font-mono">128</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
