import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { useAttack } from '../context/AttackContext'
import { useStream } from '../context/StreamContext'
import { applyDefence } from '../api/client'
import { FileText, Download, Loader2, AlertTriangle } from 'lucide-react'

// ── readable names ────────────────────────────────────────────────────────────
const ATTACK_NAMES = { fgsm: 'FGSM', pgd: 'PGD', labelflip: 'Label Flip', backdoor: 'Backdoor' }
const DEFENCE_NAMES = {
  advtrain: 'Adversarial Training',
  jpeg: 'JPEG Compression',
  smooth: 'Spatial Smoothing',
  rs: 'Randomized Smoothing',
  ensemble: 'Ensemble',
}
const PRED_HEX = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }

// ── small helpers ───────────────────────────────────────────────────────────-
const stripDataUrl = (s = '') => (s.includes(',') ? s.split(',')[1] : s)
const toDataUrl = (s = '') => (s.startsWith('data:') ? s : `data:image/jpeg;base64,${s}`)
const imgFormat = (s = '') => (s.includes('image/png') ? 'PNG' : 'JPEG')
const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
const asrColor = (a) => (a == null ? '#64748b' : a > 70 ? '#ef4444' : a > 40 ? '#f59e0b' : '#22c55e')

export default function ReportPage() {
  const { metrics, attacks, defences, lastAttackResult } = useAttack()
  const { latestFrame } = useStream()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)

  // Normalise the "most recent image" to one shape, whichever source has it.
  // Prefer a deliberate Attack-Lab capture (has clean+attacked); fall back to the
  // live stream frame so a report is still possible mid-demo.
  const capture = lastAttackResult
    ? {
        source: 'Attack Lab',
        fileName: lastAttackResult.fileName,
        cleanImage: lastAttackResult.cleanImage,
        attackImage: lastAttackResult.attackImage,
        cleanPred: lastAttackResult.cleanPred,
        cleanConf: Number(lastAttackResult.cleanConf) * 100,
        attackPred: lastAttackResult.attackPred,
        attackConf: Number(lastAttackResult.attackConf) * 100,
        attackType: lastAttackResult.attackType,
        epsilon: lastAttackResult.epsilon,
      }
    : latestFrame && latestFrame.clean_image
    ? {
        source: 'Live Stream',
        fileName: `frame_${latestFrame.frame_id}`,
        cleanImage: latestFrame.clean_image,
        attackImage: latestFrame.attack_image,
        cleanPred: String(latestFrame.clean_pred),
        cleanConf: Number(latestFrame.clean_conf) * 100,
        attackPred: String(latestFrame.attack_pred),
        attackConf: Number(latestFrame.attack_conf) * 100,
        attackType: String(latestFrame.attack_type ?? 'FGSM'),
        epsilon: String(latestFrame.epsilon ?? '0.10'),
      }
    : null

  const attackSucceeded = capture ? capture.cleanPred !== capture.attackPred : null

  const enabledDefences = Object.entries(defences)
    .filter(([, v]) => v.enabled)
    .map(([k]) => DEFENCE_NAMES[k] ?? k)

  async function handleGenerateReport() {
    if (!capture) {
      setError('No image processed yet. Run an attack in the Attack Lab (or start the live stream) first.')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      // 1) Evaluate the defence on the most recent attacked image so we can report
      //    a real defence-success verdict (defended_pred === cleanPred).
      const windowSize = defences?.smooth?.windowSize ?? 3
      let defence = null
      try {
        const res = await applyDefence(stripDataUrl(capture.attackImage), windowSize)
        const d = res.data
        defence = {
          pred: d.defended_pred,
          conf: Number(d.defended_conf) * 100,
          image: `data:image/jpeg;base64,${d.defended_image}`,
          recovered: d.defended_pred === capture.cleanPred,
          windowSize,
        }
      } catch (e) {
        console.error('Defence evaluation failed (backend offline?)', e)
        defence = null // report still generates; defence section shows "not evaluated"
      }

      buildPdf({ capture, defence, metrics, defences: enabledDefences, attackSucceeded })
    } catch (e) {
      console.error('Report generation failed', e)
      setError(e?.message || 'Report generation failed.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/25">
          <FileText className="w-5 h-5 text-sky-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-100">Security Audit Report</h2>
          <p className="text-xs text-slate-500">
            Download a PDF of the latest attack/defence result
          </p>
        </div>
      </div>

      {/* What the PDF will contain */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Included in the PDF
        </h3>
        <ul className="text-sm text-slate-400 space-y-1.5 list-disc list-inside">
          <li>Live ASR meter (current attack success rate)</li>
          <li>Frame comparison — clean vs attacked of the most recent image</li>
          <li>Which attack and defence performed</li>
          <li>Attack success (did the prediction flip?)</li>
          <li>Defence success (did smoothing recover the correct label?)</li>
        </ul>
      </div>

      {/* Live preview of the capture that will be reported */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Latest Capture {capture && <span className="text-slate-600 normal-case">· {capture.source}</span>}
        </h3>

        {!capture ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            No image processed yet — run an attack in the Attack Lab, then download.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-3">
              <figure className="rounded-lg overflow-hidden border border-slate-700/30">
                <figcaption className="bg-emerald-500/10 text-emerald-400 text-[10px] font-mono px-2 py-1">Clean</figcaption>
                <img src={toDataUrl(capture.cleanImage)} alt="clean" className="w-full h-24 object-cover bg-slate-900" />
                <div className="px-2 py-1 text-[11px] font-mono" style={{ color: PRED_HEX[capture.cleanPred] }}>
                  {capture.cleanPred} · {capture.cleanConf.toFixed(1)}%
                </div>
              </figure>
              <figure className="rounded-lg overflow-hidden border border-slate-700/30">
                <figcaption className="bg-red-500/10 text-red-400 text-[10px] font-mono px-2 py-1">
                  {capture.attackType} ε={capture.epsilon}
                </figcaption>
                <img src={toDataUrl(capture.attackImage)} alt="attacked" className="w-full h-24 object-cover bg-slate-900" />
                <div className="px-2 py-1 text-[11px] font-mono" style={{ color: PRED_HEX[capture.attackPred] }}>
                  {capture.attackPred} · {capture.attackConf.toFixed(1)}%
                </div>
              </figure>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Live ASR</span>
                <span className="font-mono font-bold" style={{ color: asrColor(metrics.asr) }}>
                  {typeof metrics.asr === 'number' ? `${metrics.asr.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Attack success</span>
                <span className={`font-mono font-bold ${attackSucceeded ? 'text-red-400' : 'text-emerald-400'}`}>
                  {attackSucceeded ? `FLIPPED ${capture.cleanPred}→${capture.attackPred}` : 'NO FLIP'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Defence success</span>
                <span className="font-mono text-slate-500">evaluated on download</span>
              </div>
              <div className="text-xs text-slate-500">
                Active defences: {enabledDefences.length ? enabledDefences.join(', ') : 'none'}
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={handleGenerateReport}
          disabled={generating || !capture}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-600/40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? 'Generating…' : 'Download PDF Report'}
        </button>
      </div>
    </div>
  )
}

// ── PDF builder (client-side, jsPDF) ──────────────────────────────────────────
function buildPdf({ capture, defence, metrics, defences, attackSucceeded }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth() // ~595
  const M = 40 // margin
  const CW = W - M * 2 // content width

  const setFill = (hex) => doc.setFillColor(...hexToRgb(hex))
  const setDraw = (hex) => doc.setDrawColor(...hexToRgb(hex))
  const setText = (hex) => doc.setTextColor(...hexToRgb(hex))

  // ── Header band ──
  setFill('#0f172a')
  doc.rect(0, 0, W, 84, 'F')
  setText('#f1f5f9')
  doc.setFont('helvetica', 'bold').setFontSize(20)
  doc.text('TrafficGuard', M, 40)
  setText('#94a3b8')
  doc.setFont('helvetica', 'normal').setFontSize(11)
  doc.text('Adversarial Security Audit Report', M, 60)
  doc.setFontSize(9)
  const stamp = new Date().toLocaleString()
  doc.text(`Generated: ${stamp}`, W - M, 40, { align: 'right' })
  doc.text(`Capture: ${capture.fileName} (${capture.source})`, W - M, 56, { align: 'right' })
  doc.text('COMP47250 · Project P14', W - M, 72, { align: 'right' })

  let y = 110

  // ── Section: ASR gauge + verdicts (two columns) ──
  sectionLabel(doc, 'ATTACK SUMMARY', M, y)
  y += 14
  const rowTop = y
  const colW = (CW - 20) / 2

  // left card: ASR gauge
  card(doc, M, rowTop, colW, 150)
  const cx = M + colW / 2
  const cy = rowTop + 96
  const R = 52
  drawArc(doc, cx, cy, R, 180, 0, '#e2e8f0', 12)
  const a = typeof metrics.asr === 'number' ? metrics.asr : null
  if (a != null) drawArc(doc, cx, cy, R, 180, 180 - (a / 100) * 180, asrColor(a), 12)
  setText(asrColor(a))
  doc.setFont('helvetica', 'bold').setFontSize(22)
  doc.text(a == null ? 'N/A' : `${a.toFixed(1)}%`, cx, cy - 4, { align: 'center' })
  setText('#64748b')
  doc.setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text('LIVE ATTACK SUCCESS RATE', cx, cy + 12, { align: 'center' })
  setText('#334155')
  doc.setFontSize(9)
  doc.text('Live ASR Meter', M + 12, rowTop + 20)

  // right card: verdicts
  const rx = M + colW + 20
  card(doc, rx, rowTop, colW, 150)
  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('Verdicts', rx + 12, rowTop + 20)

  // attack verdict badge
  badge(
    doc,
    rx + 12,
    rowTop + 34,
    colW - 24,
    attackSucceeded ? '#ef4444' : '#22c55e',
    attackSucceeded ? 'ATTACK SUCCEEDED' : 'ATTACK FAILED',
    attackSucceeded
      ? `prediction flipped  ${capture.cleanPred} -> ${capture.attackPred}`
      : `no flip — stayed ${capture.cleanPred}`
  )

  // defence verdict badge
  const defOk = defence ? defence.recovered : null
  badge(
    doc,
    rx + 12,
    rowTop + 86,
    colW - 24,
    defence == null ? '#64748b' : defOk ? '#22c55e' : '#f59e0b',
    defence == null ? 'DEFENCE NOT EVALUATED' : defOk ? 'DEFENCE RECOVERED' : 'DEFENCE DID NOT RECOVER',
    defence == null
      ? 'backend offline at download time'
      : defOk
      ? `recovered to ${defence.pred} (${defence.conf.toFixed(1)}%)`
      : `still ${defence.pred} (${defence.conf.toFixed(1)}%)`
  )

  y = rowTop + 150 + 22

  // ── Section: attack & defence performed ──
  sectionLabel(doc, 'ATTACK & DEFENCE PERFORMED', M, y)
  y += 14
  card(doc, M, y, CW, 52)
  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(10)
  doc.text(`Attack:  ${capture.attackType}  (epsilon = ${capture.epsilon})`, M + 14, y + 22)
  const defLine = defence
    ? `Defence: Spatial Smoothing (median, window ${defence.windowSize})`
    : 'Defence: Spatial Smoothing (not evaluated)'
  doc.text(defLine, M + 14, y + 40)
  setText('#64748b')
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  doc.text(`Active defences: ${defences.length ? defences.join(', ') : 'none'}`, W - M - 14, y + 40, { align: 'right' })
  y += 52 + 22

  // ── Section: frame comparison clean -> attacked -> defended ──
  sectionLabel(doc, 'FRAME COMPARISON — CLEAN vs ATTACKED', M, y)
  y += 16
  const panels = [
    { label: 'CLEAN INPUT', color: '#22c55e', img: capture.cleanImage, pred: capture.cleanPred, conf: capture.cleanConf },
    { label: `ATTACKED (${capture.attackType})`, color: '#ef4444', img: capture.attackImage, pred: capture.attackPred, conf: capture.attackConf },
  ]
  if (defence) {
    panels.push({ label: 'DEFENDED (SMOOTHED)', color: '#0ea5e9', img: defence.image, pred: defence.pred, conf: defence.conf })
  }
  const n = panels.length
  const gap = 18
  const pW = (CW - gap * (n - 1)) / n
  const pImgH = 120
  panels.forEach((p, i) => {
    const px = M + i * (pW + gap)
    // label bar
    setFill(p.color)
    doc.rect(px, y, pW, 16, 'F')
    setText('#ffffff')
    doc.setFont('helvetica', 'bold').setFontSize(7.5)
    doc.text(p.label, px + 6, y + 11)
    // image (with graceful fallback)
    try {
      doc.addImage(toDataUrl(p.img), imgFormat(toDataUrl(p.img)), px, y + 16, pW, pImgH)
    } catch (e) {
      setFill('#f1f5f9')
      doc.rect(px, y + 16, pW, pImgH, 'F')
      setText('#94a3b8')
      doc.setFont('helvetica', 'normal').setFontSize(8)
      doc.text('image unavailable', px + pW / 2, y + 16 + pImgH / 2, { align: 'center' })
    }
    // caption
    setDraw('#e2e8f0')
    doc.rect(px, y + 16 + pImgH, pW, 22)
    setText(PRED_HEX[p.pred] ?? '#334155')
    doc.setFont('helvetica', 'bold').setFontSize(9)
    doc.text(`${String(p.pred).toUpperCase()}`, px + 6, y + 16 + pImgH + 15)
    setText('#64748b')
    doc.setFont('helvetica', 'normal').setFontSize(8)
    doc.text(`conf ${Number(p.conf).toFixed(1)}%`, px + pW - 6, y + 16 + pImgH + 15, { align: 'right' })
  })
  y += 16 + pImgH + 22 + 24

  // ── Section: session metrics ──
  sectionLabel(doc, 'SESSION METRICS', M, y)
  y += 14
  card(doc, M, y, CW, 56)
  const fmt = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : 'N/A')
  metricCell(doc, M + 14, y, 'Clean Accuracy', fmt(metrics.cleanAcc), '#22c55e')
  metricCell(doc, M + 14 + CW / 4, y, 'Robust Accuracy', fmt(metrics.robustAcc), '#f59e0b')
  metricCell(doc, M + 14 + (CW / 4) * 2, y, 'Attack Success Rate', fmt(metrics.asr), '#ef4444')
  metricCell(doc, M + 14 + (CW / 4) * 3, y, 'Certified Radius', metrics.certifiedRadius ?? 'N/A', '#0ea5e9')

  // ── Footer ──
  const ph = doc.internal.pageSize.getHeight()
  setText('#94a3b8')
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text('TrafficGuard — ResNet18 traffic-congestion classifier · FGSM attack + spatial-smoothing defence', M, ph - 24)

  doc.save(`TrafficGuard_Security_Report_${Date.now()}.pdf`)
}

// ── drawing primitives ────────────────────────────────────────────────────────
function drawArc(doc, cx, cy, r, startDeg, endDeg, hex, width) {
  doc.setDrawColor(...hexToRgb(hex))
  doc.setLineWidth(width)
  doc.setLineCap('round')
  const steps = 60
  let prev = null
  for (let i = 0; i <= steps; i++) {
    const t = (startDeg + (endDeg - startDeg) * (i / steps)) * (Math.PI / 180)
    const x = cx + r * Math.cos(t)
    const yy = cy - r * Math.sin(t)
    if (prev) doc.line(prev.x, prev.y, x, yy)
    prev = { x, y: yy }
  }
  doc.setLineCap('butt')
}

function card(doc, x, y, w, h) {
  doc.setDrawColor(...hexToRgb('#e2e8f0'))
  doc.setFillColor(...hexToRgb('#f8fafc'))
  doc.setLineWidth(0.75)
  doc.roundedRect(x, y, w, h, 6, 6, 'FD')
}

function sectionLabel(doc, txt, x, y) {
  doc.setTextColor(...hexToRgb('#64748b'))
  doc.setFont('helvetica', 'bold').setFontSize(8.5)
  doc.text(txt, x, y)
}

function badge(doc, x, y, w, hex, title, sub) {
  doc.setFillColor(...hexToRgb(hex))
  doc.roundedRect(x, y, w, 40, 5, 5, 'F')
  doc.setTextColor(...hexToRgb('#ffffff'))
  doc.setFont('helvetica', 'bold').setFontSize(11)
  doc.text(title, x + 12, y + 17)
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text(sub, x + 12, y + 31)
}

function metricCell(doc, x, y, label, value, hex) {
  doc.setTextColor(...hexToRgb('#64748b'))
  doc.setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text(label.toUpperCase(), x, y + 20)
  doc.setTextColor(...hexToRgb(hex))
  doc.setFont('helvetica', 'bold').setFontSize(15)
  doc.text(String(value), x, y + 40)
}
