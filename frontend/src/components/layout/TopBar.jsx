import { Shield, Bell, Settings, Wifi, WifiOff } from 'lucide-react'
import { useStream } from '../../context/StreamContext'

export default function TopBar() {
  const { connected } = useStream()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-slate-900/95 backdrop-blur-md border-b border-slate-700/50 flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
          <Shield className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-100 tracking-wide">
            TrafficGuard
          </h1>
          <span className="text-[10px] text-slate-500 font-mono">
            COMP47250 · P14 · Adversarial ML Dashboard
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono ${
          connected
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? 'LIVE' : 'OFFLINE'}
        </div>
        <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
          <Bell className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
