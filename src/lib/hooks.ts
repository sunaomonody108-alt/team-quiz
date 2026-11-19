import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { onSnapshot, type DocumentReference, type Firestore } from 'firebase/firestore'
import { useEffect, useRef, useState } from 'react'
import { auth } from './firebase'
import { measureServerOffset } from './clock'

export function useAuthUser(): { user: User | null; ready: boolean } {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: auth.currentUser, ready: false })
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, ready: true })), [])
  return state
}

/** 参加者用:匿名ログイン(同じブラウザなら再読み込みしても同じチームに戻れる) */
export function useAnonymousUser(): { user: User | null; error: string | null } {
  const { user, ready } = useAuthUser()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (ready && !user) signInAnonymously(auth).catch((e) => setError(String(e?.message ?? e)))
  }, [ready, user])
  return { user, error }
}

export interface DocState<T> {
  data: T | null
  exists: boolean
  loading: boolean
  error: string | null
  /** サーバーで確定済みの値か(送信中の値ではない) */
  fromServer: boolean
}

export function useDocData<T>(ref: DocumentReference | null, key: string): DocState<T> {
  const [st, setSt] = useState<DocState<T>>({ data: null, exists: false, loading: true, error: null, fromServer: false })
  useEffect(() => {
    if (!ref) {
      setSt({ data: null, exists: false, loading: false, error: null, fromServer: false })
      return
    }
    setSt((s) => ({ ...s, loading: true }))
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) =>
        setSt({
          data: (snap.data() as T) ?? null,
          exists: snap.exists(),
          loading: false,
          error: null,
          fromServer: !snap.metadata.hasPendingWrites && !snap.metadata.fromCache,
        }),
      (e) => setSt({ data: null, exists: false, loading: false, error: e.code ?? String(e), fromServer: false }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return st
}

/** サーバー時刻とのずれ(ms) */
export function useServerOffset(db: Firestore, uid: string | undefined): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (!uid) return
    let alive = true
    const run = () => measureServerOffset(db, uid).then((o) => alive && setOffset(o)).catch(() => {})
    run()
    const t = setInterval(run, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [db, uid])
  return offset
}

/** 一定間隔で再描画するための「今」 */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** 一定間隔で非同期関数を呼んで値を保持する(件数の取得など) */
export function usePoll<T>(fn: (() => Promise<T>) | null, intervalMs: number, key: string): T | null {
  const [v, setV] = useState<T | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  useEffect(() => {
    setV(null)
    if (!fnRef.current) return
    let alive = true
    const run = () => fnRef.current?.().then((x) => alive && setV(x)).catch(() => {})
    run()
    const t = setInterval(run, intervalMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [key, intervalMs])
  return v
}
