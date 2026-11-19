import { getDoc, serverTimestamp, setDoc, writeBatch, type Firestore } from 'firebase/firestore'
import { answerDocId, teamNameDocId, teamNameKey } from './normalize'
import { p } from './paths'
import type { EventDoc } from './types'

export class UserError extends Error {}

export async function registerTeam(
  db: Firestore,
  eventId: string,
  dayId: string,
  uid: string,
  displayName: string,
  memberNames: string[],
): Promise<void> {
  const name = displayName.trim()
  const members = memberNames.map((m) => m.trim())
  if (!name) throw new UserError('チーム名を入力してください')
  if (name.length > 20) throw new UserError('チーム名は20文字以内にしてください')
  if (members.length !== 3 || members.some((m) => !m)) throw new UserError('3人全員の名前を入力してください')
  if (members.some((m) => m.length > 20)) throw new UserError('名前は1人20文字以内にしてください')
  const ev = (await getDoc(p.event(db, eventId))).data() as EventDoc | undefined
  const scope = ev?.settings?.teamNameScope ?? 'day'
  const nameKey = teamNameKey(name)
  const batch = writeBatch(db)
  batch.set(p.team(db, eventId, dayId, uid), {
    displayName: name,
    nameKey,
    uid,
    dayId,
    createdAt: serverTimestamp(),
  })
  batch.set(p.teamPrivate(db, eventId, dayId, uid), { memberNames: members, createdAt: serverTimestamp() })
  batch.set(p.teamName(db, eventId, teamNameDocId(scope, dayId, nameKey)), { teamId: uid, dayId, nameKey })
  try {
    await batch.commit()
  } catch (e) {
    // 同名チームが先にいると teamNames の作成が「更新」扱いになりルールで拒否される
    const exists = await getDoc(p.team(db, eventId, dayId, uid)).then(
      (s) => s.exists(),
      () => false,
    )
    if (exists) return
    throw new UserError('登録できませんでした。同じチーム名がすでにあるか、受付が締め切られています。')
  }
}

export interface SubmitPayload {
  questionId: string
  choiceId?: string
  orderIds?: string[]
}

/**
 * 回答を送る。revision は端末内で単調増加させる。
 * 締切後・古い revision はルールで拒否される(=保存されていない)。
 */
export async function submitAnswer(
  db: Firestore,
  eventId: string,
  dayId: string,
  uid: string,
  revision: number,
  payload: SubmitPayload,
): Promise<void> {
  const data: Record<string, unknown> = {
    teamId: uid,
    questionId: payload.questionId,
    revision,
    updatedAt: serverTimestamp(),
  }
  if (payload.choiceId !== undefined) data.choiceId = payload.choiceId
  if (payload.orderIds !== undefined) data.orderIds = payload.orderIds
  await setDoc(p.answer(db, eventId, dayId, answerDocId(uid, payload.questionId)), data)
}

/** 端末内の revision カウンタ。リロードしても戻らないよう時刻ベース+連番 */
let lastRev = 0
export function nextRevision(): number {
  lastRev = Math.max(lastRev + 1, Date.now())
  return lastRev
}
