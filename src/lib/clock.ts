import { getDoc, serverTimestamp, setDoc, type Firestore, type Timestamp } from 'firebase/firestore'
import { p } from './paths'

/**
 * サーバー時刻と端末時刻の差(ms)を測る。
 * 自分専用の clockSync ドキュメントにサーバー時刻を書き、読み戻して比較する。
 * 戻り値を Date.now() に足すと「だいたいのサーバー時刻」になる。表示用であり、締切判定には使わない。
 */
export async function measureServerOffset(db: Firestore, uid: string): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now()
    await setDoc(p.clock(db, uid), { t: serverTimestamp() })
    const snap = await getDoc(p.clock(db, uid))
    const t1 = Date.now()
    const server = (snap.data()?.t as Timestamp | undefined)?.toMillis()
    if (server) samples.push(server - (t0 + t1) / 2)
  }
  if (!samples.length) return 0
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

export function deadlineMs(startedAt: Timestamp | null, durationSec: number | undefined): number | null {
  if (!startedAt || !durationSec) return null
  return startedAt.toMillis() + durationSec * 1000
}
