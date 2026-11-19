import {
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { DEFAULT_SETTINGS } from './config'
import { answerDocId } from './normalize'
import { p } from './paths'
import { competitionRank, topWithTies } from './ranking'
import { judge } from './scoring'
import type {
  AnswerDoc,
  DayState,
  EventDoc,
  PrivateQuestion,
  PublicQuestion,
  PublicRankingDoc,
  TeamResultDoc,
} from './types'

/**
 * 司会者の操作。どれも「今の段階が想定どおりか」をトランザクション内で確かめてから書くので、
 * 連打・二重実行しても状態は1段階しか進まない(2回目は false を返して何もしない)。
 */

export class StaleError extends Error {}

function assertPhase(day: DayState | undefined, phases: DayState['phase'][]): asserts day is DayState {
  if (!day || !phases.includes(day.phase)) throw new StaleError(`今の段階(${day?.phase})ではこの操作はできません`)
}

async function settingsOf(db: Firestore, eventId: string) {
  const ev = (await getDoc(p.event(db, eventId))).data() as EventDoc | undefined
  return { ...DEFAULT_SETTINGS, ...(ev?.settings ?? {}) }
}

export async function setRegistration(db: Firestore, eventId: string, dayId: string, open: boolean) {
  await runTransaction(db, async (tx) => {
    const day = (await tx.get(p.day(db, eventId, dayId))).data() as DayState | undefined
    assertPhase(day, ['setup', 'registration'])
    tx.update(p.day(db, eventId, dayId), {
      registrationOpen: open,
      phase: open ? 'registration' : 'setup',
      updatedAt: serverTimestamp(),
    })
  })
}

async function loadPublicQuestion(db: Firestore, eventId: string, position: number): Promise<PublicQuestion> {
  const snap = await getDocs(query(p.qPubCol(db, eventId), where('position', '==', position)))
  if (snap.empty) throw new Error(`${position}問目の問題が登録されていません`)
  return snap.docs[0].data() as PublicQuestion
}

function toCurrent(q: PublicQuestion): DayState['currentQuestion'] {
  const c: NonNullable<DayState['currentQuestion']> = {
    id: q.id,
    position: q.position,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices,
    choiceIds: q.choices.map((x) => x.id),
    durationSec: q.durationSec,
  }
  if (q.imageUrl) c.imageUrl = q.imageUrl
  if (q.imageAlt) c.imageAlt = q.imageAlt
  return c
}

/** 受付を締め切って1問目の待機へ。全チームの得点表を0点で作る。問題をロックする */
export async function startQuiz(db: Firestore, eventId: string, dayId: string) {
  const q1 = await loadPublicQuestion(db, eventId, 1)
  const teams = await getDocs(p.teamCol(db, eventId, dayId))
  await runTransaction(db, async (tx) => {
    const day = (await tx.get(p.day(db, eventId, dayId))).data() as DayState | undefined
    assertPhase(day, ['setup', 'registration'])
    for (const t of teams.docs) {
      const r: TeamResultDoc = {
        teamId: t.id,
        displayName: t.data().displayName,
        score: 0,
        lastQuestionId: null,
        rank: null,
      }
      tx.set(p.result(db, eventId, dayId, t.id), r)
    }
    tx.update(p.event(db, eventId), { questionsLocked: true })
    tx.update(p.day(db, eventId, dayId), {
      registrationOpen: false,
      phase: 'waiting',
      questionPosition: 1,
      currentQuestion: toCurrent(q1),
      startedAt: null,
      rankingId: null,
      updatedAt: serverTimestamp(),
    })
  })
}

/** 出題開始。締切 = startedAt(サーバー時刻) + 制限時間 */
export async function startQuestion(db: Firestore, eventId: string, dayId: string) {
  await runTransaction(db, async (tx) => {
    const day = (await tx.get(p.day(db, eventId, dayId))).data() as DayState | undefined
    assertPhase(day, ['waiting'])
    tx.update(p.day(db, eventId, dayId), {
      phase: 'open',
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
}

/** 締切。ルールで「サーバー時刻が締切を過ぎている」ことが確認される */
export async function closeQuestion(db: Firestore, eventId: string, dayId: string) {
  await runTransaction(db, async (tx) => {
    const day = (await tx.get(p.day(db, eventId, dayId))).data() as DayState | undefined
    assertPhase(day, ['open'])
    tx.update(p.day(db, eventId, dayId), { phase: 'closed', updatedAt: serverTimestamp() })
  })
}

/**
 * 正解発表。採点 → 結果保存 → 正解公開 → 段階を revealed へ、を1つのトランザクションで行う。
 * 段階が closed のときしか実行されないので、同じ問題が二重に加点されることはない。
 * 正解(questionsPrivate)はこの瞬間に初めて読み込む。
 */
export async function revealAnswer(db: Firestore, eventId: string, dayId: string) {
  const teams = await getDocs(p.teamCol(db, eventId, dayId))
  await runTransaction(db, async (tx) => {
    const daySnap = await tx.get(p.day(db, eventId, dayId))
    const day = daySnap.data() as DayState | undefined
    assertPhase(day, ['closed'])
    const q = day.currentQuestion!
    const priv = (await tx.get(p.qPriv(db, eventId, q.id))).data() as PrivateQuestion | undefined
    if (!priv) throw new Error('正解データが見つかりません')
    const rows = []
    for (const t of teams.docs) {
      const a = (await tx.get(p.answer(db, eventId, dayId, answerDocId(t.id, q.id)))).data() as AnswerDoc | undefined
      const r = (await tx.get(p.result(db, eventId, dayId, t.id))).data() as TeamResultDoc | undefined
      rows.push({ teamId: t.id, name: t.data().displayName as string, a, r })
    }
    for (const row of rows) {
      const m = judge(q.type, priv, row.a)
      tx.set(p.mark(db, eventId, dayId, answerDocId(row.teamId, q.id)), {
        teamId: row.teamId,
        questionId: q.id,
        answered: m.answered,
        isCorrect: m.isCorrect,
      })
      tx.set(p.result(db, eventId, dayId, row.teamId), {
        teamId: row.teamId,
        displayName: row.name,
        score: (row.r?.score ?? 0) + (m.isCorrect ? 1 : 0),
        lastQuestionId: q.id,
        rank: row.r?.rank ?? null,
      })
    }
    const reveal: Record<string, unknown> = { questionId: q.id, type: q.type, explanation: priv.explanation ?? '' }
    if (q.type === 'multiple_choice') reveal.correctChoiceId = priv.correctChoiceId
    else reveal.correctOrderIds = priv.correctOrderIds
    tx.set(p.reveal(db, eventId, dayId, q.id), { ...reveal, revealedAt: serverTimestamp() })
    tx.update(p.day(db, eventId, dayId), { phase: 'revealed', updatedAt: serverTimestamp() })
  })
}

/** 順位を計算して、各チームの rank と会場用の上位表を書く(何度実行しても同じ結果) */
export async function writeRanking(
  db: Firestore,
  eventId: string,
  dayId: string,
  rankingId: string,
  scope: PublicRankingDoc['scope'],
  afterPosition: number,
  topRank: number,
) {
  const results = await getDocs(p.resultCol(db, eventId, dayId))
  const ranked = competitionRank(
    results.docs.map((d) => {
      const r = d.data() as TeamResultDoc
      return { teamId: r.teamId, displayName: r.displayName, score: r.score }
    }),
    false, // [確定] 途中・1日目終了ではストップウォッチで同点を分けない
  )
  const batch = writeBatch(db)
  for (const t of ranked) batch.update(p.result(db, eventId, dayId, t.teamId), { rank: t.rank })
  const doc: PublicRankingDoc = { scope, afterPosition, displayedTopRank: topRank, entries: topWithTies(ranked, topRank) }
  batch.set(p.ranking(db, eventId, dayId, rankingId), doc)
  await batch.commit()
}

/**
 * 「次へ」。正解発表のあと:
 *  - Q5/Q10/Q15 なら途中順位へ
 *  - 最終問題なら終了(Phase 2 でストップウォッチを挟む)
 *  - それ以外は次の問題の待機へ
 * 途中順位のあとは次の問題の待機へ。
 */
export interface Expected {
  phase: DayState['phase']
  questionPosition: number
}

/** 画面に表示していた段階を expected で渡す。連打の2回目は段階がずれているので拒否される */
export async function hostNext(db: Firestore, eventId: string, dayId: string, expected: Expected) {
  const settings = await settingsOf(db, eventId)
  const day = (await getDoc(p.day(db, eventId, dayId))).data() as DayState | undefined
  assertPhase(day, ['revealed', 'interim'])
  if (day.phase !== expected.phase || day.questionPosition !== expected.questionPosition)
    throw new StaleError('すでに進んでいます')
  const pos = day.questionPosition
  const goInterim = day.phase === 'revealed' && settings.interimAfter.includes(pos) && pos < day.totalQuestions
  const goFinish = day.phase === 'revealed' && pos >= day.totalQuestions
  const nextQ = !goInterim && !goFinish ? await loadPublicQuestion(db, eventId, pos + 1) : null
  const rankingId = goInterim ? `interim-${pos}` : goFinish ? 'day-final' : null

  // 先に段階を進める(ここで二重実行を弾く)。順位の書き込みはその後。
  await runTransaction(db, async (tx) => {
    const cur = (await tx.get(p.day(db, eventId, dayId))).data() as DayState | undefined
    assertPhase(cur, [day.phase])
    if (cur.questionPosition !== pos) throw new StaleError('すでに進んでいます')
    if (goInterim || goFinish) {
      tx.update(p.day(db, eventId, dayId), {
        phase: goInterim ? 'interim' : 'finished',
        rankingId,
        updatedAt: serverTimestamp(),
      })
    } else {
      tx.update(p.day(db, eventId, dayId), {
        phase: 'waiting',
        questionPosition: pos + 1,
        currentQuestion: toCurrent(nextQ!),
        startedAt: null,
        rankingId: null,
        updatedAt: serverTimestamp(),
      })
    }
  })
  if (rankingId) {
    await writeRanking(db, eventId, dayId, rankingId, goInterim ? 'interim' : 'day-final', pos, settings.venueTopRank)
  }
}

/** 回答済みチーム数(件数だけを取得。誰が何を答えたかは取らない) */
/** 途中順位/終了の段階なのに順位表がまだ無いとき(司会PCが途中で落ちた等)に作り直す */
export async function ensureRanking(db: Firestore, eventId: string, dayId: string) {
  const settings = await settingsOf(db, eventId)
  const day = (await getDoc(p.day(db, eventId, dayId))).data() as DayState | undefined
  if (!day?.rankingId || (day.phase !== 'interim' && day.phase !== 'finished')) return
  const exists = (await getDoc(p.ranking(db, eventId, dayId, day.rankingId))).exists()
  if (exists) return
  await writeRanking(
    db, eventId, dayId, day.rankingId,
    day.phase === 'interim' ? 'interim' : 'day-final',
    day.questionPosition, settings.venueTopRank,
  )
}

export async function countAnswered(db: Firestore, eventId: string, dayId: string, questionId: string) {
  const snap = await getCountFromServer(query(p.answerCol(db, eventId, dayId), where('questionId', '==', questionId)))
  return snap.data().count
}

export async function countTeams(db: Firestore, eventId: string, dayId: string) {
  return (await getCountFromServer(p.teamCol(db, eventId, dayId))).data().count
}
