import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { useState, type ReactNode } from 'react'
import { auth, db, useEmulator } from '../lib/firebase'
import { useAuthUser, useDocData } from '../lib/hooks'
import { p } from '../lib/paths'
import { Button, Card, Field, Notice, Screen } from './ui'

/** 管理者(admins に登録されたアカウント)だけが中を見られる */
export function AdminGate({ children, title }: { children: (uid: string) => ReactNode; title: string }) {
  const { user, ready } = useAuthUser()
  const isPassword = !!user && !user.isAnonymous
  const admin = useDocData(isPassword ? p.admin(db, user!.uid) : null, `admin-${user?.uid}`)
  if (!ready || (isPassword && admin.loading)) return <Screen><p className="py-20 text-center">確認中…</p></Screen>
  if (!isPassword) return <Login title={title} />
  if (!admin.exists)
    return (
      <Screen>
        <Card className="space-y-4">
          <Notice tone="error">
            このアカウント({user!.email})は管理者に登録されていません。README の「管理者の登録」の手順で、
            Firestore の admins コレクションに UID「{user!.uid}」を追加してください。
          </Notice>
          <Button variant="secondary" onClick={() => signOut(auth)}>ログアウト</Button>
        </Card>
      </Screen>
    )
  return <>{children(user!.uid)}</>
}

function Login({ title }: { title: string }) {
  const [email, setEmail] = useState(useEmulator ? 'admin@example.com' : '')
  const [pw, setPw] = useState(useEmulator ? 'password' : '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    setErr(null)
    try {
      // 同じブラウザで参加者として匿名ログインしていた場合は切り替える
      if (auth.currentUser?.isAnonymous) await signOut(auth)
      await signInWithEmailAndPassword(auth, email.trim(), pw)
    } catch {
      setErr('ログインできませんでした。メールアドレスとパスワードを確認してください。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen>
      <Card className="space-y-4">
        <h1 className="text-2xl font-black text-blue-700">{title}</h1>
        <Field label="メールアドレス" value={email} onChange={setEmail} maxLength={200} type="email" />
        <Field label="パスワード" value={pw} onChange={setPw} maxLength={200} type="password" />
        {err && <Notice tone="error">{err}</Notice>}
        {useEmulator && <Notice>開発モード(Emulator)です。テスト用管理者が入力済みです。</Notice>}
        <Button className="w-full" disabled={busy || !email || !pw} onClick={go}>ログイン</Button>
      </Card>
    </Screen>
  )
}
