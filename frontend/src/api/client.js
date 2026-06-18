import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 30000,
})

// Model endpoints
export const getModelInfo = () => api.get('/model/info')
export const getMetrics = () => api.get('/model/metrics')

// Attack endpoints
export const runFGSM = (imageB64, epsilon) =>
  api.post('/attack/fgsm', { image: imageB64, epsilon })

export const runPGD = (imageB64, epsilon, iterations = 40) =>
  api.post('/attack/pgd', { image: imageB64, epsilon, iterations })

// Poisoning endpoints
export const runLabelFlip = (rate) =>
  api.post('/attack/poison/labelflip', { rate })

export const runBackdoor = (triggerConfig) =>
  api.post('/attack/poison/backdoor', triggerConfig)

// Defence endpoints
export const getDefenceStatus = () => api.get('/defence/status')
export const toggleDefence = (name, enabled) =>
  api.post('/defence/toggle', { name, enabled })

export const getEpsilonSweep = (attackType) =>
  api.get(`/defence/epsilon-sweep?attack=${attackType}`)

export const getCertifiedRadius = (sigma) =>
  api.get(`/defence/certified-radius?sigma=${sigma}`)

// Report endpoint
export const generateReport = (sessionData) =>
  api.post('/report/generate', sessionData, { responseType: 'blob' })
