import {
  collection,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { DAY_IDS, DEFAULT_SETTINGS, TOTAL_QUESTIONS } from './config'
import { p } from './paths'
import { validateAndSplit } from './questions'
import type { DayState, EventDoc, EventSettings } from './types'

export function emptyDay(dayNumber: 1 | 2): DayState {
  return {
    dayNumber,
    phase: 'setup',
    registrationOpen: false,
    questionPosition: 0,
    totalQuestions: TOTAL_QUESTIONS,
    currentQuestion: null,
    startedAt: null,
    rankingId: null,
  }
}

/** イベントと2日分の進行ドキュメントを作る(既にある進行データは上書きしない) */
export async function initEvent(db: Firestore, eventId: string, name: string) {
  const ev: EventDoc = { name, settings: DEFAULT_SETTINGS, questionsLocked: false }
  await setDoc(p.event(db, eventId), ev)
  for (const [i, d] of DAY_IDS.entries()) {
    if (!(await getDoc(p.day(db, eventId, d))).exists()) await setDoc(p.day(db, eventId, d), emptyDay((i + 1) as 1 | 2))
  }
}

export async function updateSettings(db: Firestore, eventId: string, settings: Partial<EventSettings>) {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings)) patch[`settings.${k}`] = v
  await updateDoc(p.event(db, eventId), patch)
}

export async function setQuestionsLocked(db: Firestore, eventId: string, locked: boolean) {
  await updateDoc(p.event(db, eventId), { questionsLocked: locked })
}

/** 問題の一括登録(JSON)。公開用と非公開用に分けて保存する */
export async function importQuestions(db: Firestore, eventId: string, raw: unknown) {
  const split = validateAndSplit(raw)
  const batch = writeBatch(db)
  const old = await getDocs(p.qPubCol(db, eventId))
  const keep = new Set(split.map((s) => s.pub.id))
  for (const d of old.docs) {
    if (!keep.has(d.id)) {
      batch.delete(d.ref)
      batch.delete(p.qPriv(db, eventId, d.id))
    }
  }
  for (const { pub, priv } of split) {
    batch.set(p.qPub(db, eventId, pub.id), pub)
    batch.set(p.qPriv(db, eventId, pub.id), { ...priv, updatedAt: serverTimestamp() })
  }
  await batch.commit()
  return split.length
}

/**
 * リハーサル用:その日の登録・回答・結果をすべて消して最初に戻す。
 * 本番データも消えるので、管理画面では確認の入力を求める。
 */
export async function resetDay(db: Firestore, eventId: string, dayId: string) {
  const dayNumber = (DAY_IDS.indexOf(dayId as (typeof DAY_IDS)[number]) + 1) as 1 | 2
  const sub = ['teams', 'teamPrivate', 'answers', 'marks', 'teamResults', 'reveals', 'publicRankings']
  for (const name of sub) {
    const snap = await getDocs(collection(p.day(db, eventId, dayId), name))
    for (const d of snap.docs) await deleteDoc(d.ref)
  }
  const names = await getDocs(query(collection(db, 'events', eventId, 'teamNames'), where('dayId', '==', dayId)))
  for (const d of names.docs) await deleteDoc(d.ref)
  await setDoc(p.day(db, eventId, dayId), emptyDay(dayNumber))
}
