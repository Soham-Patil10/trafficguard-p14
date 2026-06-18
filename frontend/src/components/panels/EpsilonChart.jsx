import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { getEpsilonSweep } from '../../api/client'
import { useAttack } from '../../context/AttackContext'

const PLACEHOLDER_DATA = [
  { epsilon: 0.01, baseline: 96.2, advtrain: 91.4, jpeg: 93.1 },
  { epsilon: 0.05, baseline: 82.1, advtrain: 79.8, jpeg: 80.2 },
  { epsilon: 0.1, baseline: 61.2, advtrain: 72.3, jpeg: 67.5 },
  { epsilon: 0.2, baseline: 38.4, advtrain: 55.1, jpeg: 48.3 },
  { epsilon: 0.3, baseline: 22.1, advtrain: 40.2, jpeg: 34.7 },
]

export default function EpsilonChart() {
  const { attacks } = useAttack()
  const [sweepData, setSweepData] = useState(PLACEHOLDER_DATA)
  const [loading, setLoading] = useState(false)

  const activeAttack = attacks.fgsm.enabled
    ? 'fgsm'
    : attacks.pgd.enabled
      ? 'pgd'
      : 'fgsm'

  useEffect(() => {
    setLoading(true)
    getEpsilonSweep(activeAttack)
      .then(res => {
        const data = res.data
        if (Array.isArray(data)) {
          setSweepData(data)
        } else {
          console.warn('Epsilon sweep returned non-array data, using placeholder:', data)
          setSweepData(PLACEHOLDER_DATA)
        }
      })
      .finally(() => setLoading(false))
  }, [activeAttack])

return (
  <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all duration-300">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
        Robust Accuracy vs e — {activeAttack.toUpperCase()}
      </span>
    </div>
    <div className="h-44">
      {loading ? (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
          Loading sweep data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sweepData}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="epsilon"
              tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'monospace' }}
              label={{
                value: 'e',
                position: 'insideRight',
                fill: '#64748b',
              }}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 10 }}
              domain={[0, 100]}
              tickFormatter={v => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: '#e2e8f0', fontFamily: 'monospace' }}
              formatter={(value) => [`${value.toFixed(1)}%`]}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Baseline"
            />
            <Line
              type="monotone"
              dataKey="advtrain"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Adv. Training"
            />
            <Line
              type="monotone"
              dataKey="jpeg"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 3 }}
              strokeDasharray="6 3"
              name="JPEG+Smooth"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
)
}
