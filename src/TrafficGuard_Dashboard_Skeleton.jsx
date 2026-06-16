
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  TrafficGuard Dashboard — React Skeleton                            ║
// ║  COMP47250 · Project P14 · Summer 2026                              ║
// ║                                                                      ║
// ║  FILE STRUCTURE this skeleton assumes:                              ║
// ║                                                                      ║
// ║  src/                                                                ║
// ║  ├── App.jsx                  ← root, router, WebSocket provider    ║
// ║  ├── main.jsx                 ← ReactDOM.createRoot entry point     ║
// ║  ├── api/                                                            ║
// ║  │   ├── client.js            ← axios base + all REST calls         ║
// ║  │   └── websocket.js         ← WebSocket singleton manager         ║
// ║  ├── context/                                                        ║
// ║  │   ├── AttackContext.jsx    ← global attack/defence state         ║
// ║  │   └── StreamContext.jsx    ← live frame + metrics stream         ║
// ║  ├── components/                                                     ║
// ║  │   ├── layout/                                                     ║
// ║  │   │   ├── TopBar.jsx                                              ║
// ║  │   │   └── Sidebar.jsx                                             ║
// ║  │   ├── panels/                                                     ║
// ║  │   │   ├── StatCard.jsx                                            ║
// ║  │   │   ├── ASRMeter.jsx                                            ║
// ║  │   │   ├── FrameComparison.jsx                                     ║
// ║  │   │   ├── EpsilonChart.jsx                                        ║
// ║  │   │   ├── DefenceStatus.jsx                                       ║
// ║  │   │   ├── PredictionHistory.jsx                                   ║
// ║  │   │   └── SystemLog.jsx                                           ║
// ║  │   └── controls/                                                   ║
// ║  │       ├── AttackToggle.jsx                                        ║
// ║  │       ├── EpsilonSlider.jsx                                       ║
// ║  │       └── DefenceToggle.jsx                                       ║
// ║  └── pages/                                                          ║
// ║      ├── Dashboard.jsx        ← main view (this file shows it all)  ║
// ║      ├── AttackLab.jsx                                               ║
// ║      ├── Defences.jsx                                                ║
// ║      ├── Model.jsx                                                   ║
// ║      └── Report.jsx                                                  ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ─────────────────────────────────────────────────────────────────────────────
// 1.  src/main.jsx  — Entry point
//     HOW IT WORKS: React needs one DOM node to attach to. This file finds
//     the <div id="root"> in index.html and mounts your entire app inside it.
//     You never edit this file unless you need to add global providers.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
*/

// ─────────────────────────────────────────────────────────────────────────────
// 2.  src/api/client.js  — All REST calls to FastAPI backend
//     HOW IT WORKS: One axios instance with your FastAPI base URL baked in.
//     Every component imports from here — never write fetch() directly in JSX.
//     MEMBER 6 owns this file. Other members import functions from it.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/api/client.js
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',   // FastAPI dev server
  timeout: 30000,
})

// ── Model endpoints (Member 2 implements the FastAPI side) ──────────────────
export const getModelInfo    = ()     => api.get('/model/info')
export const getMetrics      = ()     => api.get('/model/metrics')

// ── Attack endpoints (Member 3 implements the FastAPI side) ─────────────────
export const runFGSM = (imageB64, epsilon) =>
  api.post('/attack/fgsm', { image: imageB64, epsilon })

export const runPGD  = (imageB64, epsilon, iterations=40) =>
  api.post('/attack/pgd',  { image: imageB64, epsilon, iterations })

// ── Poisoning endpoints (Member 4 implements the FastAPI side) ───────────────
export const runLabelFlip = (rate) =>
  api.post('/attack/poison/labelflip', { rate })

export const runBackdoor  = (triggerConfig) =>
  api.post('/attack/poison/backdoor', triggerConfig)

// ── Defence endpoints (Member 5 implements the FastAPI side) ─────────────────
export const getDefenceStatus = ()      => api.get('/defence/status')
export const toggleDefence    = (name, enabled) =>
  api.post('/defence/toggle', { name, enabled })

export const getEpsilonSweep = (attackType) =>
  api.get(`/defence/epsilon-sweep?attack=${attackType}`)

export const getCertifiedRadius = (sigma) =>
  api.get(`/defence/certified-radius?sigma=${sigma}`)

// ── Report endpoint (Member 6 implements) ────────────────────────────────────
export const generateReport = (sessionData) =>
  api.post('/report/generate', sessionData, { responseType: 'blob' })
*/

// ─────────────────────────────────────────────────────────────────────────────
// 3.  src/api/websocket.js  — WebSocket singleton for live frame streaming
//     HOW IT WORKS: One persistent connection to FastAPI's /ws/stream endpoint.
//     FastAPI sends JSON frames every ~200ms. This class manages connect,
//     reconnect, and notifies subscribers (React components) via callbacks.
//     MEMBER 6 owns this.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/api/websocket.js
class TrafficGuardWS {
  constructor() {
    this.ws       = null
    this.handlers = new Set()
    this.url      = 'ws://localhost:8000/ws/stream'
  }

  connect() {
    this.ws = new WebSocket(this.url)

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      // data shape from FastAPI:
      // {
      //   type:        'frame' | 'metrics' | 'attack_result',
      //   frame_id:    1240,
      //   clean_pred:  'Low',
      //   attack_pred: 'High',
      //   confidence:  0.942,
      //   asr:         38.8,
      //   timestamp:   '14:23:01'
      // }
      this.handlers.forEach(fn => fn(data))
    }

    this.ws.onclose = () => {
      console.log('WS closed — reconnecting in 2s')
      setTimeout(() => this.connect(), 2000)     // auto-reconnect
    }

    this.ws.onerror = (err) => console.error('WS error', err)
  }

  subscribe(fn)   { this.handlers.add(fn) }
  unsubscribe(fn) { this.handlers.delete(fn) }

  send(payload)   { this.ws?.send(JSON.stringify(payload)) }
}

export const wsClient = new TrafficGuardWS()
*/

// ─────────────────────────────────────────────────────────────────────────────
// 4.  src/context/AttackContext.jsx  — Global attack & defence state
//     HOW IT WORKS: React Context is a way to share state between components
//     WITHOUT passing props all the way down. Any component wrapped inside
//     <AttackProvider> can call useAttack() to read or change attack settings.
//     This is the single source of truth for which attacks are ON/OFF and
//     what epsilon values are set.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/context/AttackContext.jsx
import { createContext, useContext, useState, useCallback } from 'react'
import { toggleDefence as apiToggleDefence } from '../api/client'

const AttackContext = createContext(null)

export function AttackProvider({ children }) {
  // ── Attack state ──────────────────────────────────────────────────────────
  const [attacks, setAttacks] = useState({
    fgsm:      { enabled: true,  epsilon: 0.10 },
    pgd:       { enabled: false, epsilon: 0.10, iterations: 40 },
    labelflip: { enabled: false, rate: 10 },
    backdoor:  { enabled: false },
  })

  // ── Defence state ─────────────────────────────────────────────────────────
  const [defences, setDefences] = useState({
    advtrain: { enabled: true,  robustAcc: 72.3 },
    jpeg:     { enabled: false, quality: 75 },
    smooth:   { enabled: false, windowSize: 3 },
    rs:       { enabled: false, sigma: 0.25 },
    ensemble: { enabled: false },
  })

  // ── Metrics state ─────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState({
    cleanAcc:       83.4,
    robustAcc:      61.2,
    asr:            38.8,
    certifiedRadius: 0.25,
  })

  // ── Toggle attack ─────────────────────────────────────────────────────────
  const toggleAttack = useCallback((name) => {
    setAttacks(prev => ({
      ...prev,
      [name]: { ...prev[name], enabled: !prev[name].enabled }
    }))
  }, [])

  // ── Update epsilon ────────────────────────────────────────────────────────
  const setEpsilon = useCallback((attack, value) => {
    setAttacks(prev => ({
      ...prev,
      [attack]: { ...prev[attack], epsilon: value }
    }))
  }, [])

  // ── Toggle defence (also calls FastAPI) ───────────────────────────────────
  const toggleDef = useCallback(async (name) => {
    const newEnabled = !defences[name].enabled
    setDefences(prev => ({
      ...prev,
      [name]: { ...prev[name], enabled: newEnabled }
    }))
    try {
      await apiToggleDefence(name, newEnabled)          // tell FastAPI backend
    } catch (e) {
      console.error('Defence toggle failed', e)
    }
  }, [defences])

  return (
    <AttackContext.Provider value={{
      attacks, defences, metrics,
      setMetrics, toggleAttack, setEpsilon, toggleDef
    }}>
      {children}
    </AttackContext.Provider>
  )
}

export const useAttack = () => useContext(AttackContext)
*/

// ─────────────────────────────────────────────────────────────────────────────
// 5.  src/context/StreamContext.jsx  — Live frame stream from WebSocket
//     HOW IT WORKS: Connects to the WebSocket on mount, stores the latest
//     frame data in state, and any component using useStream() automatically
//     re-renders when a new frame arrives.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/context/StreamContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { wsClient } from '../api/websocket'

const StreamContext = createContext(null)

export function StreamProvider({ children }) {
  const [latestFrame, setLatestFrame]     = useState(null)
  const [frameHistory, setFrameHistory]   = useState([])
  const [logLines, setLogLines]           = useState([])
  const [connected, setConnected]         = useState(false)

  useEffect(() => {
    wsClient.connect()
    setConnected(true)

    const handler = (data) => {
      if (data.type === 'frame') {
        setLatestFrame(data)
        setFrameHistory(prev => [data, ...prev].slice(0, 50))  // keep last 50
        setLogLines(prev => [
          { time: data.timestamp, msg: `frame_${data.frame_id} · ${data.attack_pred}`, type: data.clean_pred !== data.attack_pred ? 'attack' : 'info' },
          ...prev
        ].slice(0, 100))
      }
    }

    wsClient.subscribe(handler)
    return () => wsClient.unsubscribe(handler)   // cleanup on unmount
  }, [])

  return (
    <StreamContext.Provider value={{ latestFrame, frameHistory, logLines, connected }}>
      {children}
    </StreamContext.Provider>
  )
}

export const useStream = () => useContext(StreamContext)
*/

// ─────────────────────────────────────────────────────────────────────────────
// 6.  src/App.jsx  — Root component with router and all providers
//     HOW IT WORKS: Wraps everything in context providers so all child
//     components can access shared state. React Router handles navigation
//     between pages (Dashboard, AttackLab, Defences, etc.)
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AttackProvider }  from './context/AttackContext'
import { StreamProvider }  from './context/StreamContext'
import TopBar   from './components/layout/TopBar'
import Sidebar  from './components/layout/Sidebar'
import Dashboard   from './pages/Dashboard'
import AttackLab   from './pages/AttackLab'
import Defences    from './pages/Defences'
import ModelPage   from './pages/Model'
import ReportPage  from './pages/Report'

export default function App() {
  return (
    <BrowserRouter>
      <AttackProvider>
        <StreamProvider>
          <div className="shell">
            <TopBar />
            <Sidebar />
            <main className="main">
              <Routes>
                <Route path="/"          element={<Dashboard />} />
                <Route path="/attacks"   element={<AttackLab />} />
                <Route path="/defences"  element={<Defences />} />
                <Route path="/model"     element={<ModelPage />} />
                <Route path="/report"    element={<ReportPage />} />
              </Routes>
            </main>
          </div>
        </StreamProvider>
      </AttackProvider>
    </BrowserRouter>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 7.  src/components/panels/StatCard.jsx  — Reusable metric display card
//     HOW IT WORKS: A pure presentational component. It takes props (value,
//     label, delta etc.) and renders them. No state, no side effects.
//     REACT CONCEPT: props are how parent components pass data to children.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/components/panels/StatCard.jsx
export default function StatCard({ title, value, unit = '', sub, delta, deltaDir, color = 'var(--green)' }) {
  //  title    — small uppercase label e.g. "Clean Accuracy"
  //  value    — the big number e.g. 83.4
  //  unit     — suffix e.g. "%"
  //  sub      — small subtitle e.g. "target ≥ 80% · ResNet-50"
  //  delta    — change badge e.g. "+18.4% defended"
  //  deltaDir — 'up' | 'down' (up = bad for ASR, good for accuracy)
  //  color    — CSS var for the value text

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{title}</span>
      </div>
      <div className="card-body">
        <div className="stat-val" style={{ color }}>
          {value}{unit}
        </div>
        {sub && <div className="stat-sub">{sub}</div>}
        {delta && (
          <span className={`stat-delta delta-${deltaDir}`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 8.  src/components/panels/ASRMeter.jsx  — SVG arc gauge
//     HOW IT WORKS: useAttack() reads the current ASR from context.
//     The SVG arc stroke-dashoffset is calculated from the ASR value to
//     animate the gauge. useMemo caches the calculation so it only recomputes
//     when asr changes, not on every render.
//     REACT CONCEPT: useMemo = cache expensive computations.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/components/panels/ASRMeter.jsx
import { useMemo } from 'react'
import { useAttack } from '../../context/AttackContext'

const ARC_LENGTH = 220  // total SVG arc path length in px

export default function ASRMeter() {
  const { metrics } = useAttack()
  const { asr } = metrics

  // Calculate arc fill based on ASR value (0–100)
  const dashOffset = useMemo(
    () => ARC_LENGTH - (asr / 100) * ARC_LENGTH,
    [asr]
  )

  const arcColor = asr > 70 ? 'var(--red)' : asr > 40 ? 'var(--amber)' : 'var(--green)'

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Live ASR Meter</span>
      </div>
      <div className="card-body">
        <div className="asr-wrap">
          <svg width="160" height="100" viewBox="0 0 160 100" overflow="visible">
            {/* Background arc */}
            <path d="M20,90 A70,70 0 0,1 140,90"
              fill="none" stroke="var(--bg3)" strokeWidth="14" strokeLinecap="round"/>
            {/* Value arc — animated by dashOffset */}
            <path d="M20,90 A70,70 0 0,1 140,90"
              fill="none" stroke={arcColor} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={ARC_LENGTH}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s ease' }}
            />
            <text x="80" y="82" textAnchor="middle"
              fontFamily="var(--mono)" fontSize="22" fontWeight="700" fill={arcColor}>
              {asr.toFixed(1)}%
            </text>
            <text x="80" y="96" textAnchor="middle" fontSize="8" fill="var(--text3)">
              ATTACK SUCCESS RATE
            </text>
          </svg>
        </div>
      </div>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 9.  src/components/panels/FrameComparison.jsx  — Live frame side-by-side
//     HOW IT WORKS: Reads the latest frame from StreamContext. When a new
//     WebSocket message arrives, StreamContext updates latestFrame, which
//     causes this component to re-render automatically.
//     The frame images come as base64 strings from FastAPI's WS stream.
//     REACT CONCEPT: useEffect for side effects (data fetching, subscriptions)
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/components/panels/FrameComparison.jsx
import { useStream } from '../../context/StreamContext'

const PRED_COLORS = { Low: 'var(--green)', Medium: 'var(--amber)', High: 'var(--red)' }

export default function FrameComparison() {
  const { latestFrame } = useStream()

  // While no frame has arrived yet, show a placeholder
  if (!latestFrame) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', color: 'var(--text3)', padding: '40px' }}>
          Waiting for frame stream...
        </div>
      </div>
    )
  }

  const flipped = latestFrame.clean_pred !== latestFrame.attack_pred

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Frame Comparison — Clean vs Attacked</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text3)' }}>
          Frame #{latestFrame.frame_id}
        </span>
      </div>
      <div className="card-body">
        <div className="frames-grid">

          {/* Clean frame */}
          <div className="frame-box">
            <div className="frame-label frame-label-clean">✓ Clean Input</div>
            <div className="frame-canvas">
              {/* latestFrame.clean_image is a base64 JPEG from FastAPI */}
              <img
                src={`data:image/jpeg;base64,${latestFrame.clean_image}`}
                alt="Clean traffic frame"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div className="frame-pred">
              <span style={{ color: PRED_COLORS[latestFrame.clean_pred], fontWeight: 700 }}>
                ⬤ {latestFrame.clean_pred.toUpperCase()} CONGESTION
              </span>
              <span className="pred-conf">conf: {(latestFrame.clean_conf * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Attacked frame */}
          <div className="frame-box">
            <div className="frame-label frame-label-attacked">
              ⚡ {latestFrame.attack_type} ε={latestFrame.epsilon}
            </div>
            <div className="frame-canvas">
              <img
                src={`data:image/jpeg;base64,${latestFrame.attack_image}`}
                alt="Adversarial frame"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div className="frame-pred">
              <span style={{ color: PRED_COLORS[latestFrame.attack_pred], fontWeight: 700 }}>
                ⬤ {latestFrame.attack_pred.toUpperCase()} CONGESTION
              </span>
              <span className="pred-conf">conf: {(latestFrame.attack_conf * 100).toFixed(1)}%</span>
            </div>
          </div>

        </div>

        {/* Flip alert */}
        {flipped && (
          <div style={{
            marginTop: '8px', padding: '7px 10px', background: 'var(--red2)',
            borderRadius: '5px', border: '1px solid var(--red)',
            fontSize: '10px', color: 'var(--red)', fontFamily: 'var(--mono)'
          }}>
            ⚠ PREDICTION FLIPPED: {latestFrame.clean_pred.toUpperCase()} → {latestFrame.attack_pred.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 10. src/components/panels/EpsilonChart.jsx  — Robust Accuracy vs ε
//     HOW IT WORKS: Fetches sweep data from FastAPI on mount using useEffect.
//     Recharts renders the line chart declaratively — you give it data as an
//     array and it handles drawing. When the selected attack changes, the
//     useEffect re-runs and fetches new sweep data.
//     REACT CONCEPT: useEffect dependency array controls when effects re-run.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/components/panels/EpsilonChart.jsx
import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getEpsilonSweep } from '../../api/client'
import { useAttack } from '../../context/AttackContext'

export default function EpsilonChart() {
  const { attacks } = useAttack()
  const [sweepData, setSweepData] = useState([])
  const [loading, setLoading]     = useState(true)

  // Which attack is currently enabled?
  const activeAttack = attacks.fgsm.enabled ? 'fgsm' : attacks.pgd.enabled ? 'pgd' : 'fgsm'

  // Fetch sweep data whenever the active attack changes
  useEffect(() => {
    setLoading(true)
    getEpsilonSweep(activeAttack)
      .then(res => {
        setSweepData(res.data)
        // res.data shape from FastAPI:
        // [
        //   { epsilon: 0.01, baseline: 96.2, advtrain: 91.4, jpeg: 93.1 },
        //   { epsilon: 0.05, baseline: 82.1, advtrain: 79.8, jpeg: 80.2 },
        //   { epsilon: 0.10, baseline: 61.2, advtrain: 72.3, jpeg: 67.5 },
        //   { epsilon: 0.20, baseline: 38.4, advtrain: 55.1, jpeg: 48.3 },
        //   { epsilon: 0.30, baseline: 22.1, advtrain: 40.2, jpeg: 34.7 },
        // ]
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [activeAttack])  // ← re-runs when activeAttack changes

  if (loading) return <div className="card" style={{ padding: '20px', color: 'var(--text3)' }}>Loading sweep data...</div>

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Robust Accuracy vs ε — {activeAttack.toUpperCase()}</span>
      </div>
      <div className="card-body">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={sweepData}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
            <XAxis dataKey="epsilon" tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'monospace' }} label={{ value: 'ε', position: 'insideRight', fill: 'var(--text3)' }}/>
            <YAxis tick={{ fill: 'var(--text3)', fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`}/>
            <Tooltip
              contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4 }}
              labelStyle={{ color: 'var(--text)', fontFamily: 'monospace' }}
              formatter={(value) => [`${value.toFixed(1)}%`]}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }}/>
            <Line type="monotone" dataKey="baseline"  stroke="var(--red)"    strokeWidth={2} dot={{ r: 3 }} name="Baseline"/>
            <Line type="monotone" dataKey="advtrain"  stroke="var(--green)"  strokeWidth={2} dot={{ r: 3 }} name="Adv. Training"/>
            <Line type="monotone" dataKey="jpeg"      stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="6 3" name="JPEG+Smooth"/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 11. src/components/controls/AttackToggle.jsx  — Sidebar toggle control
//     HOW IT WORKS: Reads state from AttackContext, calls toggleAttack() to
//     update it. Also sends a WebSocket message to FastAPI so the backend
//     starts/stops generating adversarial frames.
//     REACT CONCEPT: Lifting state up — state lives in context, not in the
//     toggle itself, so every other component always sees the same value.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/components/controls/AttackToggle.jsx
import { useAttack } from '../../context/AttackContext'
import { wsClient }  from '../../api/websocket'

export default function AttackToggle({ attackName, label, dotColor }) {
  const { attacks, toggleAttack } = useAttack()
  const attack = attacks[attackName]

  function handleChange() {
    toggleAttack(attackName)
    // Tell FastAPI backend via WebSocket to start/stop attack generation
    wsClient.send({
      type:    'attack_control',
      attack:  attackName,
      enabled: !attack.enabled,
      epsilon: attack.epsilon,
    })
  }

  return (
    <div className="toggle-row">
      <span className="toggle-label">
        <span className="dot" style={{ background: dotColor }}/>
        {label}
      </span>
      <label className="toggle">
        <input type="checkbox" checked={attack.enabled} onChange={handleChange}/>
        <span className="slider"/>
      </label>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 12. src/components/panels/SystemLog.jsx  — WebSocket event log
//     HOW IT WORKS: useStream() gives the logLines array from StreamContext.
//     useRef keeps a reference to the scroll container so we can auto-scroll
//     to the bottom when new lines arrive. useEffect triggers the scroll
//     whenever logLines changes.
//     REACT CONCEPT: useRef = direct DOM access without re-rendering.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/components/panels/SystemLog.jsx
import { useEffect, useRef } from 'react'
import { useStream } from '../../context/StreamContext'

const TYPE_COLORS = {
  attack:  'var(--red)',
  defence: 'var(--green)',
  info:    'var(--accent)',
  warn:    'var(--amber)',
}

export default function SystemLog() {
  const { logLines, connected } = useStream()
  const bottomRef = useRef(null)

  // Auto-scroll to bottom when new log lines arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines])

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">System Log</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: connected ? 'var(--green)' : 'var(--red)' }}>
          {connected ? '● WS connected' : '● disconnected'}
        </span>
      </div>
      <div className="card-body">
        <div className="log-lines" style={{ maxHeight: '120px', overflowY: 'auto' }}>
          {logLines.map((line, i) => (
            <div key={i} className="log-line">
              <span className="ts">{line.time}</span>
              <span style={{ color: TYPE_COLORS[line.type] ?? 'var(--text3)' }}>
                {line.msg}
              </span>
            </div>
          ))}
          <div ref={bottomRef}/>
        </div>
      </div>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 13. src/pages/Report.jsx  — PDF report generation page
//     HOW IT WORKS: Collects all current metrics from AttackContext and
//     frameHistory from StreamContext, sends to FastAPI /report/generate,
//     gets back a PDF blob, and triggers a browser download.
//     This is the "automated PDF security report" from the brief.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/pages/Report.jsx
import { useState } from 'react'
import { useAttack }  from '../context/AttackContext'
import { useStream }  from '../context/StreamContext'
import { generateReport } from '../api/client'

export default function ReportPage() {
  const { metrics, attacks, defences } = useAttack()
  const { frameHistory }               = useStream()
  const [generating, setGenerating]    = useState(false)

  async function handleGenerateReport() {
    setGenerating(true)
    try {
      const sessionData = {
        metrics,
        attacks,
        defences,
        frameHistory: frameHistory.slice(0, 100),  // last 100 frames
        generatedAt: new Date().toISOString(),
      }

      const response = await generateReport(sessionData)
      // FastAPI returns a PDF blob — trigger browser download
      const url  = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href  = url
      link.setAttribute('download', `TrafficGuard_Security_Report_${Date.now()}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (e) {
      console.error('Report generation failed', e)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <h2>Security Audit Report</h2>
      {/* Summary metrics display */}
      <div>Clean Accuracy: {metrics.cleanAcc}%</div>
      <div>Robust Accuracy: {metrics.robustAcc}%</div>
      <div>ASR: {metrics.asr}%</div>
      <div>Certified Radius: {metrics.certifiedRadius}</div>
      <button onClick={handleGenerateReport} disabled={generating}>
        {generating ? 'Generating...' : 'Download PDF Report'}
      </button>
    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// 14. src/pages/Dashboard.jsx  — Main dashboard page (assembles everything)
//     HOW IT WORKS: Imports all panel components and arranges them in a grid.
//     No logic here — just layout. All data comes through context.
// ─────────────────────────────────────────────────────────────────────────────
/*
// src/pages/Dashboard.jsx
import StatCard          from '../components/panels/StatCard'
import ASRMeter          from '../components/panels/ASRMeter'
import FrameComparison   from '../components/panels/FrameComparison'
import EpsilonChart      from '../components/panels/EpsilonChart'
import DefenceStatus     from '../components/panels/DefenceStatus'
import PredictionHistory from '../components/panels/PredictionHistory'
import SystemLog         from '../components/panels/SystemLog'
import { useAttack }     from '../context/AttackContext'

export default function Dashboard() {
  const { metrics } = useAttack()

  return (
    <div className="main">

      {/* Row 1 — Stat cards */}
      <div className="row row-4">
        <StatCard title="Clean Accuracy"   value={metrics.cleanAcc}       unit="%" sub="target ≥ 80% · ResNet-50"       color="var(--green)"/>
        <StatCard title="Robust Accuracy"  value={metrics.robustAcc}      unit="%" sub="under active attack"             color="var(--amber)"/>
        <StatCard title="Attack Success"   value={metrics.asr}            unit="%" sub="frames flipped by active attack" color="var(--red)"/>
        <StatCard title="Certified Radius" value={metrics.certifiedRadius} sub="σ=0.25 · Randomized Smoothing · ℓ₂"    color="var(--purple)"/>
      </div>

      {/* Row 2 — ASR gauge + frame comparison */}
      <div className="row row-2-3">
        <ASRMeter/>
        <FrameComparison/>
      </div>

      {/* Row 3 — Epsilon chart + defence status */}
      <div className="row" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <EpsilonChart/>
        <DefenceStatus/>
      </div>

      {/* Row 4 — History + log */}
      <div className="row row-2">
        <PredictionHistory/>
        <SystemLog/>
      </div>

    </div>
  )
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// HOW TO RUN THIS PROJECT
//
// Prerequisites: Node.js 18+, Python 3.11+
//
// 1. Bootstrap the React app:
//    npm create vite@latest trafficguard-dashboard -- --template react
//    cd trafficguard-dashboard
//    npm install axios react-router-dom recharts
//
// 2. Copy the component files above into src/ following the directory structure
//    shown at the top of this file.
//
// 3. Start FastAPI backend (Member 6):
//    cd backend/
//    uvicorn main:app --reload --port 8000
//
// 4. Start React dev server:
//    npm run dev
//    → opens at http://localhost:5173
//
// 5. For production (Docker):
//    npm run build          → outputs dist/
//    Dockerfile copies dist/ into nginx:alpine container
//    Docker Compose connects frontend container to model-api container
//
// QUICK REACT REFERENCE FOR YOUR TEAM
//
// useState(initial)    → [value, setValue]   declare reactive state
// useEffect(fn, [deps])→ side effects (fetch, subscribe, DOM) — re-runs when deps change
// useContext(Context)  → read shared state without prop drilling
// useRef(null)         → direct DOM reference without triggering re-render
// useMemo(fn, [deps])  → cache expensive calculations
// useCallback(fn,[deps])→ cache function references (prevents child re-renders)
//
// Data flow in TrafficGuard:
//   FastAPI WS → wsClient → StreamContext → [FrameComparison, SystemLog, PredictionHistory]
//   FastAPI REST → api/client.js → EpsilonChart, Report page
//   User interaction → AttackToggle/DefenceToggle → AttackContext → StatCard, ASRMeter
// ─────────────────────────────────────────────────────────────────────────────
