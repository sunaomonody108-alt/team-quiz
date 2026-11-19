import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setRegistration, startQuiz, startQuestion } from '../../src/lib/host'
import { p } from '../../src/lib/paths'
import { registerTeam, submitAnswer } from '../../src/lib/participant'
import { adminDb, closeClients, E, makeEnv, seed, teamDb } from './helpers'

let env: RulesTestEnvironment
beforeAll(async () => { env = await makeEnv() })
afterAll(async () => { await closeClients(); await env.cleanup() })
beforeEach(async () => { await seed(env, 20) })

describe('T01 チーム登録', () => {
  it('受付中なら登録でき、同じ日の同名チームは拒否される', async () => {
    await setRegistration(adminDb(env), E, 'day1', true)
    await registerTeam(teamDb(env, 'u1'), E, 'day1', 'u1', 'ねこ組', ['A', 'B', 'C'])
    await expect(registerTeam(teamDb(env, 'u2'), E, 'day1', 'u2', 'ねこ組', ['D', 'E', 'F'])).rejects.toThrow(/同じチーム名/)
    await expect(registerTeam(teamDb(env, 'u3'), E, 'day1', 'u3', ' ねこ組　', ['D', 'E', 'F'])).rejects.toThrow()
    await registerTeam(teamDb(env, 'u4'), E, 'day1', 'u4', 'いぬ組', ['D', 'E', 'F'])
  })
  it('受付前・締切後は登録できない', async () => {
    await expect(registerTeam(teamDb(env, 'u1'), E, 'day1', 'u1', 'ねこ組', ['A', 'B', 'C'])).rejects.toThrow()
  })
  it('氏名が3人そろっていないと登録できない(ルール側でも拒否)', async () => {
    await setRegistration(adminDb(env), E, 'day1', true)
    const db = teamDb(env, 'u1')
    await assertFails(setDoc(p.teamPrivate(db, E, 'day1', 'u1'), { memberNames: ['A', 'B'] }))
  })
  it('[未決定]設定: 重複判定をイベント全体にすると、別の日でも同名は不可', async () => {
    await seed(env, 20, { teamNameScope: 'event' })
    await setRegistration(adminDb(env), E, 'day1', true)
    await setRegistration(adminDb(env), E, 'day2', true)
    await registerTeam(teamDb(env, 'u1'), E, 'day1', 'u1', 'ねこ組', ['A', 'B', 'C'])
    await expect(registerTeam(teamDb(env, 'u2'), E, 'day2', 'u2', 'ねこ組', ['D', 'E', 'F'])).rejects.toThrow()
  })
  it('既定(日ごと)なら別の日の同名は登録できる', async () => {
    await setRegistration(adminDb(env), E, 'day1', true)
    await setRegistration(adminDb(env), E, 'day2', true)
    await registerTeam(teamDb(env, 'u1'), E, 'day1', 'u1', 'ねこ組', ['A', 'B', 'C'])
    await registerTeam(teamDb(env, 'u2'), E, 'day2', 'u2', 'ねこ組', ['D', 'E', 'F'])
  })
})

describe('T09/T17 秘密情報の読み取り制限', () => {
  beforeEach(async () => {
    await setRegistration(adminDb(env), E, 'day1', true)
    await registerTeam(teamDb(env, 'u1'), E, 'day1', 'u1', 'ねこ組', ['A', 'B', 'C'])
    await registerTeam(teamDb(env, 'u2'), E, 'day1', 'u2', 'いぬ組', ['D', 'E', 'F'])
  })
  it('参加者は正解・問題一覧を読めない', async () => {
    const db = teamDb(env, 'u1')
    await assertFails(getDoc(p.qPriv(db, E, 'q01')))
    await assertFails(getDocs(p.qPrivCol(db, E)))
    await assertFails(getDoc(p.qPub(db, E, 'q02')))
  })
  it('参加者は他チームの氏名・チーム情報・回答を読めない', async () => {
    const db = teamDb(env, 'u1')
    await assertSucceeds(getDoc(p.teamPrivate(db, E, 'day1', 'u1')))
    await assertFails(getDoc(p.teamPrivate(db, E, 'day1', 'u2')))
    await assertFails(getDocs(p.teamPrivateCol(db, E, 'day1')))
    await assertFails(getDocs(p.teamCol(db, E, 'day1')))
    await assertFails(getDoc(p.answer(db, E, 'day1', 'u2__q01')))
    await assertFails(getDocs(p.answerCol(db, E, 'day1')))
  })
  it('参加者は進行状態・得点・順位・正解発表を書き換えられない', async () => {
    const db = teamDb(env, 'u1')
    await assertFails(updateDoc(p.day(db, E, 'day1'), { phase: 'finished' }))
    await assertFails(setDoc(p.result(db, E, 'day1', 'u1'), { score: 20 }))
    await assertFails(setDoc(p.reveal(db, E, 'day1', 'q01'), { correctChoiceId: 'c1' }))
    await assertFails(setDoc(p.ranking(db, E, 'day1', 'day-final'), { entries: [] }))
    await assertFails(setDoc(doc(db, 'admins', 'u1'), {}))
  })
  it('参加者が読める進行状態には正解が含まれない', async () => {
    await startQuiz(adminDb(env), E, 'day1')
    await startQuestion(adminDb(env), E, 'day1')
    const snap = await getDoc(p.day(teamDb(env, 'u1'), E, 'day1'))
    expect(JSON.stringify(snap.data())).not.toMatch(/correct|explanation/)
  })
  it('登録していない人は受付締切後の進行状態を読めない', async () => {
    await startQuiz(adminDb(env), E, 'day1')
    await assertFails(getDoc(p.day(teamDb(env, 'stranger'), E, 'day1')))
  })
  it('出題前の問題には回答できない', async () => {
    await startQuiz(adminDb(env), E, 'day1')
    await assertFails(submitAnswer(teamDb(env, 'u1'), E, 'day1', 'u1', 1, { questionId: 'q01', choiceId: 'c1' }))
  })
  it('他チームになりすまして回答できない', async () => {
    await startQuiz(adminDb(env), E, 'day1')
    await startQuestion(adminDb(env), E, 'day1')
    const db = teamDb(env, 'u1')
    await assertFails(setDoc(p.answer(db, E, 'day1', 'u2__q01'), { teamId: 'u2', questionId: 'q01', choiceId: 'c1', revision: 1 }))
  })
  it('存在しない選択肢・不完全な並べ替えは保存できない', async () => {
    await startQuiz(adminDb(env), E, 'day1')
    await startQuestion(adminDb(env), E, 'day1')
    const db = teamDb(env, 'u1')
    await assertFails(submitAnswer(db, E, 'day1', 'u1', 1, { questionId: 'q01', choiceId: 'c9' }))
    await assertFails(submitAnswer(db, E, 'day1', 'u1', 1, { questionId: 'q01', orderIds: ['c1', 'c2', 'c3', 'c4'] }))
  })
})
