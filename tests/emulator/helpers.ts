import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { getApps as adminApps, initializeApp as adminInit } from 'firebase-admin/app'
import { getFirestore as adminFirestore } from 'firebase-admin/firestore'
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { emptyDay } from '../../src/lib/admin'
import { DEFAULT_SETTINGS } from '../../src/lib/config'
import { validateAndSplit } from '../../src/lib/questions'
import { MOCK_QUESTIONS } from '../../src/mock/questions'

export const E = 'main'

export async function makeEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-quiz',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
}

/** 管理者・イベント・2日分・20問を用意。テストを速くするため制限時間だけ短くする */
export async function seed(env: RulesTestEnvironment, durationSec = 1, settings = {}, questions: unknown = MOCK_QUESTIONS) {
  await env.clearFirestore()
  {
    const db = ownerDb()
    const setDoc = (path: string, data: object) => db.doc(path).set(data)
    await setDoc('admins/admin', { note: 'test' })
    await setDoc(`events/${E}`, {
      name: 'テスト大会',
      settings: { ...DEFAULT_SETTINGS, ...settings },
      questionsLocked: false,
    })
    await setDoc(`events/${E}/days/day1`, emptyDay(1))
    await setDoc(`events/${E}/days/day2`, emptyDay(2))
    for (const { pub, priv } of validateAndSplit(questions)) {
      await setDoc(`events/${E}/questionsPublic/${pub.id}`, { ...pub, durationSec })
      await setDoc(`events/${E}/questionsPrivate/${pub.id}`, priv)
    }
  }
}

/** ルールを無視して読み書きできる(テストの準備・検証用) */
export function ownerDb() {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  const app = adminApps()[0] ?? adminInit({ projectId: 'demo-quiz' })
  return adminFirestore(app)
}

// 本番アプリと同じ modular SDK のクライアントを、認証済みユーザーとして Emulator につなぐ
const apps: FirebaseApp[] = []
const cache = new Map<string, Firestore>()
function clientFor(uid: string, provider: string): Firestore {
  const hit = cache.get(uid)
  if (hit) return hit
  const app = initializeApp({ projectId: 'demo-quiz', apiKey: 'demo' }, `client-${uid}-${apps.length}`)
  apps.push(app)
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', 8080, {
    mockUserToken: { sub: uid, user_id: uid, firebase: { sign_in_provider: provider, identities: {} } },
  })
  cache.set(uid, db)
  return db
}
export async function closeClients() {
  cache.clear()
  await Promise.all(apps.splice(0).map((a) => deleteApp(a)))
}

export const adminDb = (_env?: RulesTestEnvironment) => clientFor('admin', 'password')
export const teamDb = (_env: RulesTestEnvironment | undefined, uid: string) => clientFor(uid, 'anonymous')

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
