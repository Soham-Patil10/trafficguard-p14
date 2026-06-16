import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AttackProvider } from './context/AttackContext'
import { StreamProvider } from './context/StreamContext'
import TopBar from './components/layout/TopBar'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import AttackLab from './pages/AttackLab'
import Defences from './pages/Defences'
import ModelPage from './pages/Model'
import ReportPage from './pages/Report'

export default function App() {
  return (
    <BrowserRouter>
      <AttackProvider>
        <StreamProvider>
          <div className="min-h-screen bg-slate-950 text-slate-100">
            <TopBar />
            <Sidebar />
            <main className="ml-60 mt-14 p-5">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/attacks" element={<AttackLab />} />
                <Route path="/defences" element={<Defences />} />
                <Route path="/model" element={<ModelPage />} />
                <Route path="/report" element={<ReportPage />} />
              </Routes>
            </main>
          </div>
        </StreamProvider>
      </AttackProvider>
    </BrowserRouter>
  )
}
