import { useAttack } from '../../context/AttackContext'

export default function DefenceToggle({ defenceName, label }) {
  const { defences, toggleDef } = useAttack()
  const defence = defences[defenceName]
  if (!defence) return null

  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-300 font-mono">{label}</span>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={defence.enabled}
          onChange={() => toggleDef(defenceName)}
          className="sr-only peer"
        />
        <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600" />
      </label>
    </div>
  )
}
