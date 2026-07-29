import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { useAttack } from '../context/AttackContext'
import { useStream } from '../context/StreamContext'
import { applyDefence } from '../api/client'
import { FileText, Download, Loader2, AlertTriangle } from 'lucide-react'

// ── readable names (matches final attack/defence list) ────────────────────────
const ATTACK_NAMES = {
  fgsm:      'FGSM',
  pgd:       'PGD',
  labelflip: 'Label Flipping',
  deepfool:  'DeepFool',
}
const DEFENCE_NAMES = {
  adv_train: 'Adversarial Training',
  smooth:    'Spatial Smoothing',
  diffusion: 'Diffusion Purification',
  rs:        'Randomised Smoothing',
}
const PRED_HEX = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' }

// ── small helpers ─────────────────────────────────────────────────────────────
const stripDataUrl = (s = '') => (s.includes(',') ? s.split(',')[1] : s)
const toDataUrl    = (s = '') => (s.startsWith('data:') ? s : `data:image/jpeg;base64,${s}`)
const imgFormat    = (s = '') => (s.includes('image/png') ? 'PNG' : 'JPEG')
const hexToRgb     = (hex) => {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}
// Fix: ASR colour thresholds
const asrColor = (a) => (a == null ? '#64748b' : a > 70 ? '#ef4444' : a > 40 ? '#f59e0b' : '#22c55e')

// Fix: normalise confidence to percentage exactly once
const toPercent = (v) => {
  const n = Number(v)
  if (isNaN(n)) return 0
  return n <= 1 ? n * 100 : n   // if already a percentage (>1) leave it alone
}

export default function ReportPage() {
  const { metrics, attacks, defences, lastAttackResult, lastDefenceResult } = useAttack()
  const { latestFrame } = useStream()
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState(null)

  // Prefer Attack Lab capture; fall back to live stream frame
  const capture = lastAttackResult
    ? {
        source:     'Attack Lab',
        fileName:   lastAttackResult.fileName,
        cleanImage: lastAttackResult.cleanImage,
        attackImage:lastAttackResult.attackImage,
        cleanPred:  lastAttackResult.cleanPred,
        cleanConf:  toPercent(lastAttackResult.cleanConf),
        attackPred: lastAttackResult.attackPred,
        attackConf: toPercent(lastAttackResult.attackConf),
        attackType: lastAttackResult.attackType,
        epsilon:    lastAttackResult.epsilon,
      }
    : latestFrame?.clean_image
    ? {
        source:     'Live Stream',
        fileName:   `frame_${latestFrame.frame_id}`,
        cleanImage: latestFrame.clean_image,
        attackImage:latestFrame.attack_image,
        cleanPred:  String(latestFrame.clean_pred),
        cleanConf:  toPercent(latestFrame.clean_conf),
        attackPred: String(latestFrame.attack_pred),
        attackConf: toPercent(latestFrame.attack_conf),
        attackType: String(latestFrame.attack_type ?? 'FGSM'),
        epsilon:    String(latestFrame.epsilon ?? '0.10'),
      }
    : null

  const attackSucceeded = capture ? capture.cleanPred !== capture.attackPred : null

  const enabledAttacks  = Object.entries(attacks)
    .filter(([, v]) => v.enabled)
    .map(([k]) => ATTACK_NAMES[k] ?? k)

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
        // Use the defence result already computed in the Defence Lab
        // instead of re-running it, so the report matches what the dashboard showed
        const defence = lastDefenceResult
          ? {
              pred:            lastDefenceResult.pred,
              conf:            Number(lastDefenceResult.conf),
              image:           lastDefenceResult.image,
              recovered:       lastDefenceResult.recovered,
              windowSize:      lastDefenceResult.windowSize ?? 3,
              certifiedRadius: lastDefenceResult.certifiedRadius ?? null,
              abstained:       lastDefenceResult.abstained ?? false,
              sigma:           lastDefenceResult.sigma ?? null,
              nSamples:        lastDefenceResult.nSamples ?? null,
            }
          : null

        buildPdf({
          capture,
          defence,
          metrics,
          enabledAttacks,
          enabledDefences,
          attackSucceeded,
          attacks,
          defences,
        })
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
          <p className="text-xs text-slate-500">Download a PDF of the latest attack / defence result</p>
        </div>
      </div>

      {/* What the PDF will contain */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
          Included in the PDF
        </h3>
        <ul className="text-sm text-slate-400 space-y-1.5 list-disc list-inside">
          <li>Live ASR meter (current attack success rate)</li>
          <li>Frame comparison — clean vs attacked vs defended</li>
          <li>Attack performed (FGSM / PGD / Label Flipping / DeepFool) and epsilon value</li>
          <li>Defence performed (Spatial Smoothing / Diffusion Purification / Randomised Smoothing / JPEG)</li>
          <li>Attack success verdict (did the prediction flip?)</li>
          <li>Defence success verdict (did the defence recover the correct label?)</li>
          <li>Session metrics — clean accuracy, robust accuracy, ASR, certified radius</li>
          <li>Active attacks and defences at time of generation</li>
        </ul>
      </div>

      {/* Live preview */}
      <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-5">
        <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
          Latest Capture{capture && <span className="text-slate-600 normal-case"> · {capture.source}</span>}
        </h3>

        {!capture ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            No image processed yet — run an attack in the Attack Lab, then download.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid grid-cols-3 gap-3">
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
            <figure className="rounded-lg overflow-hidden border border-slate-700/30">
              <figcaption className="bg-sky-500/10 text-sky-400 text-[10px] font-mono px-2 py-1">Defended</figcaption>
              {lastDefenceResult ? (
                <>
                  <img src={toDataUrl(lastDefenceResult.image)} alt="defended" className="w-full h-24 object-cover bg-slate-900" />
                  <div className="px-2 py-1 text-[11px] font-mono" style={{ color: PRED_HEX[lastDefenceResult.pred] }}>
                    {lastDefenceResult.pred} · {Number(lastDefenceResult.conf).toFixed(1)}%
                  </div>
                </>
              ) : (
                <>
                  <div className="w-full h-24 bg-slate-900 flex items-center justify-center">
                    <span className="text-slate-600 text-[10px]">run defence first</span>
                  </div>
                  <div className="px-2 py-1 text-[11px] font-mono text-slate-600">—</div>
                </>
              )}
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
                <span className={`font-mono font-bold ${lastDefenceResult ? (lastDefenceResult.recovered ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-500'}`}>
                  {lastDefenceResult ? (lastDefenceResult.recovered ? `RECOVERED → ${lastDefenceResult.pred}` : `NOT RECOVERED · ${lastDefenceResult.pred}`) : 'run defence first'}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Active attacks: {enabledAttacks.length ? enabledAttacks.join(', ') : 'none'}
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

// ── PDF builder ───────────────────────────────────────────────────────────────
function buildPdf({ capture, defence, metrics, enabledAttacks, enabledDefences, attackSucceeded, attacks, defences }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W  = doc.internal.pageSize.getWidth()
  const H  = doc.internal.pageSize.getHeight()
  const M  = 40
  const CW = W - M * 2

  const setFill = (hex) => doc.setFillColor(...hexToRgb(hex))
  const setDraw = (hex) => doc.setDrawColor(...hexToRgb(hex))
  const setText = (hex) => doc.setTextColor(...hexToRgb(hex))

  const checkPage = (y, needed = 60) => {
    if (y + needed > H - 40) { doc.addPage(); return 40 }
    return y
  }

  // helper: wrap and print a block of body text, returns new y
  const printBody = (text, x, startY, maxWidth, lineHeight = 13) => {
    const lines = doc.splitTextToSize(text, maxWidth)
    setText('#475569')
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    doc.text(lines, x, startY)
    return startY + lines.length * lineHeight
  }

  // ── Risk rating ──────────────────────────────────────────────────────────
  const asr = typeof metrics.asr === 'number' ? metrics.asr : null
  const riskLabel  = asr == null ? 'UNKNOWN' : asr > 70 ? 'HIGH' : asr > 40 ? 'MEDIUM' : 'LOW'
  const riskColor  = asr == null ? '#64748b' : asr > 70 ? '#ef4444' : asr > 40 ? '#f59e0b' : '#22c55e'
  const riskExpl   = asr == null
    ? 'No attack data recorded this session.'
    : asr > 70
    ? 'The model is highly vulnerable. Adversarial attacks succeed at a rate exceeding 70%, posing a significant risk in deployment.'
    : asr > 40
    ? 'The model shows moderate vulnerability. Attacks succeed in 40-70% of cases, warranting defensive hardening before deployment.'
    : 'The model demonstrates reasonable robustness. Attack success rate is below 40%, though further hardening is still recommended.'

  // ── Header band ──────────────────────────────────────────────────────────
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
  doc.text('COMP47250 · Project P14 · UCD', W - M, 72, { align: 'right' })

  let y = 110

  // ── Section 0: Executive Summary ─────────────────────────────────────────
  sectionLabel(doc, 'EXECUTIVE SUMMARY', M, y); y += 14
  const summaryH = 100
  card(doc, M, y, CW, summaryH)

  // Risk badge inline
  setFill(riskColor)
  doc.roundedRect(M + 14, y + 12, 70, 22, 4, 4, 'F')
  setText('#ffffff')
  doc.setFont('helvetica', 'bold').setFontSize(10)
  doc.text(`RISK: ${riskLabel}`, M + 49, y + 26, { align: 'center' })

  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('TrafficGuard — ResNet18 Traffic Congestion Classifier', M + 94, y + 20)
  setText('#475569')
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text('MIO-TCD dataset · Low / Medium / High congestion classes · COMP47250 Project P14', M + 94, y + 33)

  const summaryText = `This report documents an adversarial robustness audit of a ResNet18-based traffic congestion classifier. The model was subjected to evasion attacks (${capture.attackType}, eps=${capture.epsilon}) and evaluated against defensive mechanisms (${enabledDefences.length ? enabledDefences.join(', ') : 'none active'}). Results are presented below for security review and deployment risk assessment.`
  printBody(summaryText, M + 14, y + 52, CW - 28)
  y += summaryH + 22

  // ── Section 1: ASR gauge + verdicts ──────────────────────────────────────
  y = checkPage(y, 180)
  sectionLabel(doc, 'ATTACK SUMMARY', M, y); y += 14
  const rowTop = y
  const colW   = (CW - 20) / 2

  card(doc, M, rowTop, colW, 160)
  const cx = M + colW / 2
  const cy = rowTop + 100
  const R  = 52
  drawArc(doc, cx, cy, R, 180, 0, '#e2e8f0', 12)
  if (asr != null) drawArc(doc, cx, cy, R, 180, 180 - (asr / 100) * 180, asrColor(asr), 12)
  setText(asrColor(asr))
  doc.setFont('helvetica', 'bold').setFontSize(22)
  doc.text(asr == null ? 'N/A' : `${asr.toFixed(1)}%`, cx, cy - 4, { align: 'center' })
  setText('#64748b')
  doc.setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text('LIVE ATTACK SUCCESS RATE', cx, cy + 14, { align: 'center' })
  setText('#334155')
  doc.setFontSize(9)
  doc.text('Live ASR Meter', M + 12, rowTop + 20)

  const rx = M + colW + 20
  card(doc, rx, rowTop, colW, 160)
  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('Verdicts', rx + 12, rowTop + 20)

  badge(
    doc, rx + 12, rowTop + 36, colW - 24,
    attackSucceeded ? '#ef4444' : '#22c55e',
    attackSucceeded ? 'ATTACK SUCCEEDED' : 'ATTACK FAILED',
    attackSucceeded
      ? `prediction flipped  ${capture.cleanPred} -> ${capture.attackPred}`
      : `no flip - stayed ${capture.cleanPred}`
  )
  const defOk = defence ? defence.recovered : null
  badge(
    doc, rx + 12, rowTop + 96, colW - 24,
    defence == null ? '#64748b' : defOk ? '#22c55e' : '#f59e0b',
    defence == null ? 'DEFENCE NOT EVALUATED' : defOk ? 'DEFENCE RECOVERED' : 'DEFENCE DID NOT RECOVER',
    defence == null
      ? 'run defence in Defence Lab before generating report'
      : defOk
      ? `recovered to ${defence.pred} (${Number(defence.conf).toFixed(1)}%)`
      : `still ${defence.pred} (${Number(defence.conf).toFixed(1)}%)`
  )

  y = rowTop + 160 + 22

  // ── Section 2: Attack details ─────────────────────────────────────────────
  y = checkPage(y, 120)
  sectionLabel(doc, 'ATTACK DETAILS', M, y); y += 14
  card(doc, M, y, CW, 110)

  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text(`${capture.attackType}  (epsilon = ${capture.epsilon})`, M + 14, y + 18)

  const attackDescriptions = {
    FGSM:      'Fast Gradient Sign Method (FGSM) is a single-step evasion attack that perturbs each pixel by a fixed epsilon in the direction of the loss gradient. It is computationally cheap and effective, making it a standard baseline for robustness evaluation. The attack is untargeted — it pushes the prediction away from the correct class without specifying a target class.',
    PGD:       'Projected Gradient Descent (PGD) is an iterative evasion attack that takes multiple small gradient steps, projecting back into the epsilon-ball after each step. It is strictly stronger than FGSM at the same epsilon and is considered the gold standard for adversarial robustness evaluation (Madry et al., 2018).',
    DeepFool:  'DeepFool (Moosavi-Dezfooli et al., 2016) finds the minimal L2 perturbation needed to cross the nearest decision boundary. Unlike FGSM/PGD which use a fixed epsilon budget, DeepFool adapts the perturbation magnitude per image. The returned L2 norm is a per-image robustness score — smaller values indicate the model is easier to fool.',
    'Label Flipping': 'Label Flipping is a data poisoning attack applied at training time. A fraction of training labels are flipped to incorrect classes, degrading model reliability from within. Unlike evasion attacks, this cannot be applied to a deployed model — it requires access to the training pipeline.',
  }
  const attackDesc = attackDescriptions[capture.attackType] ?? `${capture.attackType} attack applied at epsilon = ${capture.epsilon}.`
  printBody(attackDesc, M + 14, y + 32, CW - 28, 12)

  setText('#64748b')
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text(`Attack type: untargeted evasion  |  epsilon: ${capture.epsilon}  |  clean pred: ${capture.cleanPred}  |  attacked pred: ${capture.attackPred}`, M + 14, y + 98)
  y += 110 + 22

  // ── Section 3: Defence details ────────────────────────────────────────────
  y = checkPage(y, 120)
  sectionLabel(doc, 'DEFENCE DETAILS', M, y); y += 14
  card(doc, M, y, CW, 110)

  const activeDefenceName = enabledDefences.length ? enabledDefences[0] : 'None'
  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text(`${activeDefenceName}`, M + 14, y + 18)

  const defenceDescriptions = {
    'Adversarial Training':  'Adversarial training (Madry et al., 2018) exposes the model to adversarial examples during training, forcing it to learn features that are robust to gradient-based perturbations. The defended prediction is produced by a separately trained hardened ResNet18 rather than by pre-processing the input.',
    'Spatial Smoothing':       `Spatial smoothing applies a ${defence?.windowSize ?? 3}x${defence?.windowSize ?? 3} median filter to the input image before inference. The median filter replaces each pixel with the median value of its neighbours, which destroys the fine-grained high-frequency perturbations introduced by gradient-based attacks. It is computationally cheap and requires no model retraining (Xu et al., 2018).`,
    'Randomised Smoothing':    `Randomised smoothing (Cohen et al., 2019) adds Gaussian noise (sigma=${defence?.sigma ?? 0.25}) to the input n=${defence?.nSamples ?? 256} times and takes a majority vote across predictions. It provides a certifiable robustness guarantee: the model is provably correct for any perturbation with L2 norm smaller than the certified radius (${defence?.certifiedRadius != null ? defence.certifiedRadius : 'N/A'}). If no class achieves an absolute majority the classifier abstains.`,
    'Diffusion Purification':  'Diffusion purification (Nie et al., 2022) runs the adversarial image through a forward-and-reverse diffusion process using a pre-trained DDPM. The forward pass adds calibrated Gaussian noise that overwhelms the adversarial perturbation; the reverse pass uses the denoising UNet to reconstruct a clean version of the scene. The purified image is then classified by the ResNet18.',
    'None':                    'No defence was applied during this session. The model was evaluated on adversarial examples without any defensive pre-processing.',
  }
  const defenceDesc = defenceDescriptions[activeDefenceName] ?? `${activeDefenceName} defence applied.`
  printBody(defenceDesc, M + 14, y + 32, CW - 28, 12)

  if (defence) {
    const defSummary = defence.certifiedRadius != null
      ? `Defended pred: ${defence.pred}  |  conf: ${Number(defence.conf).toFixed(1)}%  |  certified radius: ${defence.certifiedRadius}  |  recovered: ${defence.recovered ? 'yes' : 'no'}`
      : `Defended pred: ${defence.pred}  |  conf: ${Number(defence.conf).toFixed(1)}%  |  recovered: ${defence.recovered ? 'yes' : 'no'}`
    setText('#64748b')
    doc.setFont('helvetica', 'normal').setFontSize(8)
    doc.text(defSummary, M + 14, y + 98)
  }
  y += 110 + 22

  // ── Section 4: Frame comparison ───────────────────────────────────────────
  y = checkPage(y, 180)
  sectionLabel(doc, 'FRAME COMPARISON — CLEAN vs ATTACKED vs DEFENDED', M, y); y += 16
  const panels = [
    { label: 'CLEAN INPUT',                    color: '#22c55e', img: capture.cleanImage,  pred: capture.cleanPred,  conf: capture.cleanConf },
    { label: `ATTACKED (${capture.attackType})`, color: '#ef4444', img: capture.attackImage, pred: capture.attackPred, conf: capture.attackConf },
  ]
  if (defence) {
    panels.push({ label: 'DEFENDED', color: '#0ea5e9', img: defence.image, pred: defence.pred, conf: defence.conf })
  }
  const np   = panels.length
  const gap  = 16
  const pW   = (CW - gap * (np - 1)) / np
  const pImgH = 110
  panels.forEach((p, i) => {
    const px = M + i * (pW + gap)
    setFill(p.color)
    doc.rect(px, y, pW, 16, 'F')
    setText('#ffffff')
    doc.setFont('helvetica', 'bold').setFontSize(7)
    doc.text(p.label, px + 6, y + 11)
    try {
      doc.addImage(toDataUrl(p.img), imgFormat(toDataUrl(p.img)), px, y + 16, pW, pImgH)
    } catch {
      setFill('#f1f5f9')
      doc.rect(px, y + 16, pW, pImgH, 'F')
      setText('#94a3b8')
      doc.setFont('helvetica', 'normal').setFontSize(8)
      doc.text('image unavailable', px + pW / 2, y + 16 + pImgH / 2, { align: 'center' })
    }
    setDraw('#e2e8f0')
    doc.rect(px, y + 16 + pImgH, pW, 24)
    setText(PRED_HEX[p.pred] ?? '#64748b')
    doc.setFont('helvetica', 'bold').setFontSize(9)
    doc.text(String(p.pred).toUpperCase(), px + 6, y + 16 + pImgH + 16)
    setText('#64748b')
    doc.setFont('helvetica', 'normal').setFontSize(8)
    doc.text(`conf ${Number(p.conf).toFixed(1)}%`, px + pW - 6, y + 16 + pImgH + 16, { align: 'right' })
  })
  y += 16 + pImgH + 24 + 28

  // ── Section 5: Session metrics ────────────────────────────────────────────
  y = checkPage(y, 100)
  sectionLabel(doc, 'SESSION METRICS', M, y); y += 14
  card(doc, M, y, CW, 70)
  const fmt = (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : 'N/A')
  metricCell(doc, M + 14,               y, 'Clean Accuracy',     fmt(metrics.cleanAcc),        '#22c55e')
  metricCell(doc, M + 14 + CW / 4,     y, 'Robust Accuracy',    fmt(metrics.robustAcc),       '#f59e0b')
  metricCell(doc, M + 14 + CW / 4 * 2, y, 'Attack Success Rate', fmt(metrics.asr),            '#ef4444')
  metricCell(doc, M + 14 + CW / 4 * 3, y, 'Certified Radius',
    defence?.certifiedRadius != null ? String(defence.certifiedRadius) : (metrics.certifiedRadius ?? 'N/A'),
    '#0ea5e9')
  y += 70 + 14

  // Metrics interpretation
  y = checkPage(y, 60)
  card(doc, M, y, CW, 52)
  const metricsInterp = `An ASR above 70% indicates high model vulnerability requiring urgent defensive hardening. Robust accuracy estimates model performance under attack. The certified radius (randomised smoothing only) guarantees correct predictions for all perturbations with L2 norm below this threshold.`
  printBody(metricsInterp, M + 14, y + 16, CW - 28, 12)
  y += 52 + 22

  // ── Section 6: Configuration snapshot ────────────────────────────────────
  y = checkPage(y, 120)
  sectionLabel(doc, 'CONFIGURATION SNAPSHOT', M, y); y += 14

  const attackLines = Object.entries(attacks).map(([k, v]) => {
    const name   = ATTACK_NAMES[k] ?? k
    const detail = v.epsilon != null
      ? `eps=${Number(v.epsilon).toFixed(2)}`
      : v.rate != null ? `rate=${v.rate}%` : ''
    return `${name}${detail ? ` (${detail})` : ''} - ${v.enabled ? 'ON' : 'off'}`
  })
  const defenceLines = Object.entries(defences).map(([k, v]) => {
    const name = DEFENCE_NAMES[k] ?? k
    return `${name} - ${v.enabled ? 'ON' : 'off'}`
  })
  const cardHeight = 28 + (attackLines.length * 13) + 16 + (defenceLines.length * 13) + 14
  card(doc, M, y, CW, cardHeight)

  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('Attacks configured at report time:', M + 14, y + 18)
  setText('#64748b')
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  let lineY = y + 32
  attackLines.forEach((line) => { doc.text(line, M + 14, lineY); lineY += 13 })

  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('Defences configured at report time:', M + 14, lineY + 6)
  setText('#64748b')
  doc.setFont('helvetica', 'normal').setFontSize(8.5)
  lineY += 20
  defenceLines.forEach((line) => { doc.text(line, M + 14, lineY); lineY += 13 })
  y += cardHeight + 22

  // ── Section 7: Conclusions & Recommendations ──────────────────────────────
  y = checkPage(y, 140)
  sectionLabel(doc, 'CONCLUSIONS & RECOMMENDATIONS', M, y); y += 14
  card(doc, M, y, CW, 130)

  setText('#334155')
  doc.setFont('helvetica', 'bold').setFontSize(9)
  doc.text('Overall risk verdict:', M + 14, y + 18)
  setFill(riskColor)
  doc.roundedRect(M + 110, y + 8, 50, 16, 3, 3, 'F')
  setText('#ffffff')
  doc.setFont('helvetica', 'bold').setFontSize(8)
  doc.text(riskLabel, M + 135, y + 19, { align: 'center' })

  const conclusionText = `Attack effectiveness: ${capture.attackType} at epsilon=${capture.epsilon} ${attackSucceeded ? 'successfully flipped' : 'failed to flip'} the prediction from ${capture.cleanPred} to ${capture.attackPred}. ${defence ? `Defence outcome: ${activeDefenceName} ${defence.recovered ? 'successfully recovered' : 'failed to recover'} the correct prediction.` : 'No defence was evaluated.'}`
  y = printBody(conclusionText, M + 14, y + 36, CW - 28, 12) + 8

  const recText = defence?.certifiedRadius != null && defence.certifiedRadius > 0
    ? `Recommendation: Randomised smoothing provides a certifiable robustness guarantee (radius=${defence.certifiedRadius}) but increases inference time significantly. For latency-sensitive deployments, spatial smoothing offers a practical lightweight alternative. Adversarial training on the training set is recommended as a complementary hardening measure.`
    : `Recommendation: Spatial smoothing provides partial recovery at low computational cost and is suitable for real-time deployment. For stronger guarantees, randomised smoothing (Cohen et al., 2019) offers provable robustness bounds. Adversarial training on the training set is recommended as a complementary hardening measure.`
  printBody(recText, M + 14, y, CW - 28, 12)
  y += 130 + 22

  // ── Footer ────────────────────────────────────────────────────────────────
  setText('#94a3b8')
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text(
    `TrafficGuard · ResNet18 · ${capture.attackType} attack · ${enabledDefences.length ? enabledDefences[0] : 'no defence'}`,
    M, H - 24
  )
  doc.text('COMP47250 · Project P14 · UCD', W - M, H - 24, { align: 'right' })

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
    const t  = (startDeg + (endDeg - startDeg) * (i / steps)) * (Math.PI / 180)
    const x  = cx + r * Math.cos(t)
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
  doc.roundedRect(x, y, w, 44, 5, 5, 'F')
  doc.setTextColor(...hexToRgb('#ffffff'))
  doc.setFont('helvetica', 'bold').setFontSize(11)
  doc.text(title, x + 12, y + 18)
  doc.setFont('helvetica', 'normal').setFontSize(8)
  doc.text(sub, x + 12, y + 33)
}

function metricCell(doc, x, y, label, value, hex) {
  doc.setTextColor(...hexToRgb('#64748b'))
  doc.setFont('helvetica', 'normal').setFontSize(7.5)
  doc.text(label.toUpperCase(), x, y + 22)
  doc.setTextColor(...hexToRgb(hex))
  doc.setFont('helvetica', 'bold').setFontSize(15)
  doc.text(String(value), x, y + 46)
}
