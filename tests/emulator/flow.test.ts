import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { getDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  closeQuestion,
  countAnswered,
  countTeams,
  ensureRanking,
  hostNext,
  revealAnswer,
  setRegistration,
  startQuestion,
  startQuiz,
} from '../../src/lib/host'
import { p } from '../../src/lib/paths'
import { registerTeam, submitAnswer } from '../../src/lib/participant'
import { validateAndSplit } from '../../src/lib/questions'
import type { DayState, MarkDoc, PublicRankingDoc, TeamResultDoc } from '../../src/lib/types'
import { MOCK_QUESTIONS } from '../../src/mock/questions'
import { adminDb, closeClients, E, makeEnv, ownerDb, seed, sleep, teamDb } from './helpers'

const DUR = 1 // テスト用に制限時間を1秒にする(本番は20/30秒)
const QS = validateAndSplit(MOCK_QUESTIONS)

let env: RulesTestEnvironment
beforeAll(async () => { env = await makeEnv() })
afterAll(async () => { await closeClients(); await env.cleanup() })
beforeEach(async () => { await seed(env, DUR) })

async function dayOf(d = 'day1') {
  return (await ownerDb().doc(`events/${E}/days/${d}`).get()).data() as DayState
}
const waitDeadline = () => sleep(DUR * 1000 + 300)

/** 正解/不正解の回答を作る */
function answerFor(qi: number, correct: boolean) {
  const { pub, priv } = QS[qi]
  if (pub.type === 'multiple_choice') {
    const wrong = pub.choices.find((c) => c.id !== priv.correctChoiceId)!.id
    return { questionId: pub.id, choiceId: correct ? priv.correctChoiceId! : wrong }
  }
  const order = [...priv.correctOrderIds!]
  if (!correct) [order[0], order[1]] = [order[1], order[0]]
  return { questionId: pub.id, orderIds: order }
}

describe('1日分の通し進行(10チーム・20問)', () => {
  it('T03/T06/T07/T11/T12/T19: 共通締切・二重操作防止・途中順位・終了順位', async () => {
    const admin = adminDb(env)
    await setRegistration(admin, E, 'day1', true)
    const teams = Array.from({ length: 10 }, (_, i) => `team${String(i).padStart(2, '0')}`)
    await Promise.all(teams.map((u, i) => registerTeam(teamDb(env, u), E, 'day1', u, `チーム${i}`, ['あ', 'い', 'う'])))
    expect(await countTeams(admin, E, 'day1')).toBe(10)

    await startQuiz(admin, E, 'day1')
    // 受付締切後は登録できない
    await expect(registerTeam(teamDb(env, 'late'), E, 'day1', 'late', '遅刻', ['a', 'b', 'c'])).rejects.toThrow()
    // 連打しても二重に開始されない
    await expect(startQuiz(admin, E, 'day1')).rejects.toThrow()

    // チーム i は「問題番号 <= 20 - i*2」までは正解する → 得点は 20,18,16,...,2
    // ただし team00 と team01 は同点にしたいので team01 も全問正解
    const correctUpTo = (i: number) => (i <= 1 ? 20 : 20 - i * 2)

    for (let qi = 0; qi < 20; qi++) {
      const pos = qi + 1
      let day = await dayOf()
      expect(day.phase).toBe('waiting')
      expect(day.questionPosition).toBe(pos)
      await startQuestion(admin, E, 'day1')
      await expect(startQuestion(admin, E, 'day1')).rejects.toThrow() // 連打

      // 全チームが回答(最初に不正解→最後に正しい答えへ変更、のパターンも混ぜる)
      await Promise.all(
        teams.map(async (u, i) => {
          const want = pos <= correctUpTo(i)
          if (i === 9) return // team09 は常に未回答
          if (i % 2 === 0) {
            await submitAnswer(teamDb(env, u), E, 'day1', u, 1, answerFor(qi, !want))
            await submitAnswer(teamDb(env, u), E, 'day1', u, 2, answerFor(qi, want))
          } else {
            await submitAnswer(teamDb(env, u), E, 'day1', u, 5, answerFor(qi, want))
          }
        }),
      )
      expect(await countAnswered(admin, E, 'day1', QS[qi].pub.id)).toBe(9)

      // T06: 全員回答しても締切前は締められない
      await expect(closeQuestion(admin, E, 'day1')).rejects.toThrow()
      await waitDeadline()
      // T07: 締切後の回答は拒否され、既存回答も変わらない
      await assertFails(submitAnswer(teamDb(env, 'team01'), E, 'day1', 'team01', 99, answerFor(qi, false)))
      await closeQuestion(admin, E, 'day1')
      await expect(closeQuestion(admin, E, 'day1')).rejects.toThrow()

      // 正解発表前は本人も正誤を読めない
      await assertFails(getDoc(p.mark(teamDb(env, 'team00'), E, 'day1', `team00__${QS[qi].pub.id}`)))

      await revealAnswer(admin, E, 'day1')
      await expect(revealAnswer(admin, E, 'day1')).rejects.toThrow() // 二重採点しない

      const m = (await assertSucceeds(getDoc(p.mark(teamDb(env, 'team02'), E, 'day1', `team02__${QS[qi].pub.id}`)))).data() as MarkDoc
      expect(m.isCorrect).toBe(pos <= correctUpTo(2))
      const r = (await assertSucceeds(getDoc(p.result(teamDb(env, 'team00'), E, 'day1', 'team00')))).data() as TeamResultDoc
      expect(r.score).toBe(pos)

      const shown = { phase: 'revealed' as const, questionPosition: pos }
      await hostNext(admin, E, 'day1', shown)
      await expect(hostNext(admin, E, 'day1', shown)).rejects.toThrow() // 連打しても1段階だけ
      day = await dayOf()
      if ([5, 10, 15].includes(pos)) {
        expect(day.phase).toBe('interim')
        const rk = (await getDoc(p.ranking(teamDb(env, 'team05'), E, 'day1', `interim-${pos}`))).data() as PublicRankingDoc
        expect(rk.entries.every((e) => e.rank <= 3)).toBe(true)
        await hostNext(admin, E, 'day1', { phase: 'interim', questionPosition: pos })
      }
    }

    const day = await dayOf()
    expect(day.phase).toBe('finished')
    await ensureRanking(admin, E, 'day1') // すでにあるので何もしない
    const fin = (await getDoc(p.ranking(teamDb(env, 'team03'), E, 'day1', 'day-final'))).data() as PublicRankingDoc
    // 20,20,16,14,... → 1位,1位,3位
    expect(fin.entries).toEqual([
      { rank: 1, displayName: 'チーム0', score: 20 },
      { rank: 1, displayName: 'チーム1', score: 20 },
      { rank: 3, displayName: 'チーム2', score: 16 },
    ])
    const own = (await getDoc(p.result(teamDb(env, 'team09'), E, 'day1', 'team09'))).data() as TeamResultDoc
    expect(own.score).toBe(0)
    expect(own.rank).toBe(10)
    // 会場用の順位表に個人名は含まれない
    expect(JSON.stringify(fin)).not.toMatch(/あ|い|う/)
  }, 120_000)
})

describe('T05 回答の到着順逆転', () => {
  it('新しい revision の後に古い revision が届いても上書きされない', async () => {
    const admin = adminDb(env)
    await seed(env, 20)
    await setRegistration(admin, E, 'day1', true)
    await registerTeam(teamDb(env, 'u1'), E, 'day1', 'u1', 'A', ['a', 'b', 'c'])
    await startQuiz(admin, E, 'day1')
    await startQuestion(admin, E, 'day1')
    const db = teamDb(env, 'u1')
    await submitAnswer(db, E, 'day1', 'u1', 200, { questionId: 'q01', choiceId: 'c3' })
    await assertFails(submitAnswer(db, E, 'day1', 'u1', 100, { questionId: 'q01', choiceId: 'c2' }))
    await assertFails(submitAnswer(db, E, 'day1', 'u1', 200, { questionId: 'q01', choiceId: 'c2' }))
    const a = await ownerDb().doc(`events/${E}/days/day1/answers/u1__q01`).get()
    expect(a.data()?.choiceId).toBe('c3')
  })
})

describe('T18 2日間のスコープ分離', () => {
  it('2日目のチームは1日目の正解発表・順位を読めない。問題は同じものが出る', async () => {
    const admin = adminDb(env)
    await setRegistration(admin, E, 'day1', true)
    await registerTeam(teamDb(env, 'd1'), E, 'day1', 'd1', 'A', ['a', 'b', 'c'])
    await startQuiz(admin, E, 'day1')
    await startQuestion(admin, E, 'day1')
    await waitDeadline()
    await closeQuestion(admin, E, 'day1')
    await revealAnswer(admin, E, 'day1')

    await setRegistration(admin, E, 'day2', true)
    await registerTeam(teamDb(env, 'd2'), E, 'day2', 'd2', 'A', ['x', 'y', 'z'])
    const d2 = teamDb(env, 'd2')
    await assertFails(getDoc(p.reveal(d2, E, 'day1', 'q01')))
    await assertFails(getDoc(p.day(d2, E, 'day1')))
    await assertSucceeds(getDoc(p.reveal(teamDb(env, 'd1'), E, 'day1', 'q01')))

    await startQuiz(admin, E, 'day2')
    const day2 = await dayOf('day2')
    const day1 = await dayOf('day1')
    expect(day2.currentQuestion?.id).toBe(day1.currentQuestion?.id)
    expect(day2.currentQuestion?.prompt).toBe(day1.currentQuestion?.prompt)
  })
})

describe('問題のロック', () => {
  it('1日目を開始すると問題を編集できない', async () => {
    const admin = adminDb(env)
    await setRegistration(admin, E, 'day1', true)
    await startQuiz(admin, E, 'day1')
    const { setDoc } = await import('firebase/firestore')
    await assertFails(setDoc(p.qPriv(admin, E, 'q01'), { explanation: '書き換え' }))
  })
})
