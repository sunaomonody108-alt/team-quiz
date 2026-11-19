import { HashRouter, Link, Route, Routes } from 'react-router-dom'
import { Card, Screen } from './components/ui'
import Admin from './pages/Admin'
import Host from './pages/Host'
import Join from './pages/Join'

// GitHub Pages など静的サーバーでも動くように、URLは「#/join/day1」の形(ハッシュ方式)にしている
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/join/:dayId" element={<Join />} />
        <Route path="/host/:dayId" element={<Host />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  )
}

function Home() {
  return (
    <Screen>
      <Card className="space-y-4">
        <h1 className="text-2xl font-black text-blue-700">チーム対抗クイズ</h1>
        <p className="text-slate-600">参加者の方は、会場のQRコードを読み取ってください。</p>
        <div className="flex flex-col gap-2 text-sm">
          <Link className="text-blue-700 underline" to="/admin">運営:管理画面</Link>
          <Link className="text-blue-700 underline" to="/host/day1">運営:1日目の司会者画面</Link>
          <Link className="text-blue-700 underline" to="/host/day2">運営:2日目の司会者画面</Link>
        </div>
      </Card>
    </Screen>
  )
}
