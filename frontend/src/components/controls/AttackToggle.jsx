import { useAttack } from '../../context/AttackContext'
import { wsClient } from '../../api/websocket'

export default function AttackToggle({ attackName, label, dotColor }) {
  const { attacks, toggleAttack } = useAttack()
  const attack = attacks[attackName]
  if (!attack) return null

  function handleChange() {
    const willEnable = !attack.enabled
    // Only one attack can be active at a time, so enabling this one implicitly
    // disables whichever other attack was previously on — let the WS know too.
    const othersToDisable = willEnable
      ? Object.keys(attacks).filter((key) => key !== attackName && attacks[key]?.enabled)
      : []

    toggleAttack(attackName)

    wsClient.send({
      type: 'attack_control',
      attack: attackName,
      enabled: willEnable,
      epsilon: attack.epsilon,
    })
    othersToDisable.forEach((key) => {
      wsClient.send({
        type: 'attack_control',
        attack: key,
        enabled: false,
        epsilon: attacks[key]?.epsilon,
      })
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: dotColor, opacity: attack.enabled ? 1 : 0.3 }}
        />
        <span className="text-[11px] text-slate-300 font-mono">{label}</span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={attack.enabled}
          onChange={handleChange}
          className="sr-only peer"
        />
        <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600" />
      </label>
    </div>
  )
}
