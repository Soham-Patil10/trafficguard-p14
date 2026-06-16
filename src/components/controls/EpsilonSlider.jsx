import { useAttack } from '../../context/AttackContext'
import { wsClient } from '../../api/websocket'

export default function EpsilonSlider() {
  const { attacks, setEpsilon } = useAttack()
  const activeAttack = attacks.fgsm.enabled ? 'fgsm' : attacks.pgd.enabled ? 'pgd' : null

  if (!activeAttack) return null

  const epsilon = attacks[activeAttack].epsilon

  function handleChange(e) {
    const val = parseFloat(e.target.value)
    setEpsilon(activeAttack, val)
    wsClient.send({
      type: 'epsilon_change',
      attack: activeAttack,
      epsilon: val,
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Epsilon
        </span>
        <span className="text-[11px] font-mono text-emerald-400">
          {epsilon.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min="0.01"
        max="0.50"
        step="0.01"
        value={epsilon}
        onChange={handleChange}
        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
      />
      <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-0.5">
        <span>0.01</span>
        <span>0.25</span>
        <span>0.50</span>
      </div>
    </div>
  )
}
