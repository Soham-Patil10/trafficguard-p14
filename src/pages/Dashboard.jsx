import StatCard from '../components/panels/StatCard'
import ASRMeter from '../components/panels/ASRMeter'
import FrameComparison from '../components/panels/FrameComparison'
import EpsilonChart from '../components/panels/EpsilonChart'
import DefenceStatus from '../components/panels/DefenceStatus'
import PredictionHistory from '../components/panels/PredictionHistory'
import SystemLog from '../components/panels/SystemLog'
import { useAttack } from '../context/AttackContext'

export default function Dashboard() {
  const { metrics } = useAttack()

  return (
    <div className="space-y-4">
      {/* Row 1 — Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Clean Accuracy"
          value={metrics.cleanAcc}
          unit="%"
          sub="target >= 80% · ResNet-50"
          color="#34d399"
        />
        <StatCard
          title="Robust Accuracy"
          value={metrics.robustAcc}
          unit="%"
          sub="under active attack"
          color="#f59e0b"
        />
        <StatCard
          title="Attack Success"
          value={metrics.asr}
          unit="%"
          sub="frames flipped by active attack"
          color="#ef4444"
        />
        <StatCard
          title="Certified Radius"
          value={metrics.certifiedRadius}
          sub="sigma=0.25 · Randomized Smoothing"
          color="#38bdf8"
        />
      </div>

      {/* Row 2 — ASR gauge + frame comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ASRMeter />
        <div className="lg:col-span-2">
          <FrameComparison />
        </div>
      </div>

      {/* Row 3 — Epsilon chart + defence status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <EpsilonChart />
        </div>
        <DefenceStatus />
      </div>

      {/* Row 4 — History + log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PredictionHistory />
        <SystemLog />
      </div>
    </div>
  )
}
