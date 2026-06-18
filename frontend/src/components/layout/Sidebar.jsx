import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Zap,
  ShieldCheck,
  Brain,
  FileText,
} from 'lucide-react'
import AttackToggle from '../controls/AttackToggle'
import EpsilonSlider from '../controls/EpsilonSlider'
import DefenceToggle from '../controls/DefenceToggle'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/attacks', icon: Zap, label: 'Attack Lab' },
  { to: '/defences', icon: ShieldCheck, label: 'Defences' },
  { to: '/model', icon: Brain, label: 'Model' },
  { to: '/report', icon: FileText, label: 'Report' },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-14 bottom-0 w-60 bg-slate-900/95 backdrop-blur-md border-r border-slate-700/50 flex flex-col z-40 overflow-y-auto">
      <nav className="flex-1 py-4">
        <div className="px-4 mb-3">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Navigation</span>
        </div>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-700/50 py-4 px-4 space-y-4">
        <div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Attacks</span>
          <div className="mt-2 space-y-2">
            <AttackToggle attackName="fgsm" label="FGSM" dotColor="#f87171" />
            <AttackToggle attackName="pgd" label="PGD" dotColor="#fb923c" />
            <AttackToggle attackName="labelflip" label="Label Flip" dotColor="#facc15" />
            <AttackToggle attackName="backdoor" label="Backdoor" dotColor="#c084fc" />
          </div>
        </div>

        <EpsilonSlider />

        <div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Defences</span>
          <div className="mt-2 space-y-2">
            <DefenceToggle defenceName="advtrain" label="Adv. Training" />
            <DefenceToggle defenceName="jpeg" label="JPEG Compress" />
            <DefenceToggle defenceName="smooth" label="Smoothing" />
            <DefenceToggle defenceName="rs" label="Rand. Smoothing" />
            <DefenceToggle defenceName="ensemble" label="Ensemble" />
          </div>
        </div>
      </div>
    </aside>
  )
}
