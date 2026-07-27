import axios from 'axios'

// VITE_API_URL: unset in dev (defaults to the local backend); set to '' in
// production (.env.production) so requests go same-origin to the host serving
// this bundle.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  timeout: 120000,
})

// Model endpoints
export const getModelInfo = () => api.get('/model/info')
export const getMetrics = () => api.get('/model/metrics')

// Attack endpoints
export const runFGSM = (imageB64, epsilon) =>
  api.post('/attack/fgsm', { image: imageB64, epsilon })

export const runPGD = (imageB64, epsilon, iterations = 40) =>
  api.post('/attack/pgd', { image: imageB64, epsilon, iterations })

export const runDeepFool = (imageB64, maxIter = 50) =>
  api.post('/attack/deepfool', { image: imageB64, max_iter: maxIter })

// Poisoning endpoints
export const runLabelFlip = (rate) =>
  api.post('/attack/poison/labelflip', { rate })


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

// Defence Lab: defend an already-attacked image
export const applyDefence = (image, windowSize, defence = 'smooth') =>
  api.post('/defence/apply', { image, window: windowSize, defence })

// Preset test images for the Attack Lab gallery
export const getSamples = () => api.get('/samples')

// Model comparison: clean vs poisoned (label-flipped) model on one image
export const getCompareStatus = () => api.get('/compare/status')
export const compareModels = (imageB64) =>
  api.post('/compare/models', { image: imageB64 })
 
