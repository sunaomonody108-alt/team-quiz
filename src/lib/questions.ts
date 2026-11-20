import { DURATION_BY_TYPE, MAX_DURATION_SEC, MAX_QUESTIONS, MAX_TEXT_ANSWER, MIN_DURATION_SEC, MIN_QUESTIONS } from './config'
import { answerKey } from './normalize'
import type { PrivateQuestion, PublicQuestion, QuestionInput } from './types'

export interface SplitQuestion {
  pub: PublicQuestion
  priv: PrivateQuestion
}

/**
 * インポートされた問題を検証し、公開部分と非公開部分に分ける。
 * 制限時間は durationSec(秒)があればそれを使い、無ければ問題タイプの初期値(4択20秒・並べ替え30秒)。
 * 問題IDは q01〜q20 に振り直す(IDから正解が推測できないよう、選択肢IDも c1〜c4 等に振り直す)。
 */
export function validateAndSplit(input: unknown, requireExactCount = true): SplitQuestion[] {
  if (!Array.isArray(input)) throw new Error('問題データは配列(リスト)で入力してください')
  if (requireExactCount && (input.length < MIN_QUESTIONS || input.length > MAX_QUESTIONS))
    throw new Error(`問題は${MIN_QUESTIONS}〜${MAX_QUESTIONS}問にしてください(今は${input.length}問)`)
  const sorted = [...(input as QuestionInput[])].sort((a, b) => a.position - b.position)
  return sorted.map((q, i) => {
    const n = i + 1
    const where = `${n}問目`
    if (q.position !== n) throw new Error(`${where}: position は1から順番に重複なく付けてください`)
    if (q.type !== 'multiple_choice' && q.type !== 'ordering' && q.type !== 'text_input')
      throw new Error(`${where}: type は multiple_choice / ordering / text_input のどれかです`)
    if (!q.prompt || typeof q.prompt !== 'string') throw new Error(`${where}: 問題文(prompt)がありません`)
    if (q.type === 'text_input') return splitText(q, n, where)
    if (!Array.isArray(q.choices)) throw new Error(`${where}: choices がありません`)
    if (q.type === 'multiple_choice' && q.choices.length !== 4) throw new Error(`${where}: 4択は選択肢4つです`)
    if (q.type === 'ordering' && (q.choices.length < 3 || q.choices.length > 6))
      throw new Error(`${where}: 並べ替えは3〜6項目にしてください`)
    const oldIds = q.choices.map((c) => c.id)
    if (new Set(oldIds).size !== oldIds.length) throw new Error(`${where}: 選択肢IDが重複しています`)
    for (const c of q.choices) if (!c.label) throw new Error(`${where}: 空の選択肢があります`)
    // 選択肢IDの振り直し(元IDに "correct" 等が入っていても漏れないように)
    const idMap = new Map(oldIds.map((id, k) => [id, `c${k + 1}`]))
    const choices = q.choices.map((c) => ({ id: idMap.get(c.id)!, label: String(c.label) }))
    const priv: PrivateQuestion = { explanation: String(q.explanation ?? '') }
    copyMeta(q, priv)
    if (q.type === 'multiple_choice') {
      if (!q.correctChoiceId || !idMap.has(q.correctChoiceId))
        throw new Error(`${where}: correctChoiceId が選択肢のIDと一致しません`)
      priv.correctChoiceId = idMap.get(q.correctChoiceId)
    } else {
      const order = q.correctOrderIds
      if (!Array.isArray(order) || order.length !== oldIds.length || !oldIds.every((id) => order.includes(id)))
        throw new Error(`${where}: correctOrderIds は全選択肢のIDを1回ずつ並べてください`)
      priv.correctOrderIds = order.map((id) => idMap.get(id)!)
    }
    const id = `q${String(n).padStart(2, '0')}`
    const pub: PublicQuestion = {
      id,
      position: n,
      type: q.type,
      prompt: q.prompt,
      choices,
      durationSec: durationOf(q, where),
    }
    copyImage(q, pub, where)
    return { pub, priv }
  })
}

function copyMeta(q: QuestionInput, priv: PrivateQuestion) {
  if (q.difficulty) priv.difficulty = String(q.difficulty)
  if (q.genre) priv.genre = String(q.genre)
  if (q.tone) priv.tone = String(q.tone)
}

function copyImage(q: QuestionInput, pub: PublicQuestion, where: string) {
  if (q.imageUrl) pub.imageUrl = normalizeImageUrl(String(q.imageUrl), where)
  if (q.imageAlt) pub.imageAlt = String(q.imageAlt)
}

/** 自由記述: 選択肢なし。正解は acceptedAnswers(1つ以上)。answer 1つだけでも可 */
function splitText(q: QuestionInput & { answer?: unknown }, n: number, where: string): SplitQuestion {
  const raw = q.acceptedAnswers ?? (q.answer !== undefined ? [q.answer] : undefined)
  if (!Array.isArray(raw) || raw.length === 0)
    throw new Error(`${where}: 自由記述は acceptedAnswers(正解の書き方のリスト)が必要です`)
  const accepted = raw.map((a) => String(a ?? '').trim())
  if (accepted.some((a) => !answerKey(a))) throw new Error(`${where}: 空の正解があります`)
  if (accepted.some((a) => a.length > MAX_TEXT_ANSWER))
    throw new Error(`${where}: 正解は${MAX_TEXT_ANSWER}文字以内にしてください`)
  const priv: PrivateQuestion = { explanation: String(q.explanation ?? ''), acceptedAnswers: accepted }
  copyMeta(q, priv)
  const pub: PublicQuestion = {
    id: `q${String(n).padStart(2, '0')}`,
    position: n,
    type: 'text_input',
    prompt: q.prompt,
    choices: [],
    durationSec: durationOf(q, where),
  }
  copyImage(q, pub, where)
  return { pub, priv }
}

function durationOf(q: QuestionInput, where: string): number {
  if (q.durationSec === undefined || q.durationSec === null || (q.durationSec as unknown) === '') return DURATION_BY_TYPE[q.type]
  const n = Number(q.durationSec)
  if (!Number.isInteger(n) || n < MIN_DURATION_SEC || n > MAX_DURATION_SEC)
    throw new Error(`${where}: durationSec(制限時間・秒)は${MIN_DURATION_SEC}〜${MAX_DURATION_SEC}の整数にしてください`)
  return n
}

/** 編集用に公開+非公開を1つにまとめ直す(エクスポート用) */
export function mergeForExport(pub: PublicQuestion, priv: PrivateQuestion): QuestionInput {
  const { id: _id, ...rest } = pub
  return { ...rest, ...priv }
}

/**
 * 画像パスを整える。GitHub Pages ではアプリが /team-quiz/ の下にあるため、
 * "/quiz-assets/q02.svg" のような先頭スラッシュ付きパスはドメイン直下を指して表示できない。
 * 先頭の "/" や "./" を外して、アプリからの相対パス(quiz-assets/q02.svg)にする。
 * 外部画像は https のみ許可。
 */
export function normalizeImageUrl(url: string, where = ''): string {
  const u = url.trim()
  if (/^https:\/\//i.test(u)) return u
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//'))
    throw new Error(`${where}: 画像は https:// か、アプリ内のパス(quiz-assets/…)で指定してください`)
  return u.replace(/^(\.\/|\/)+/, '')
}
