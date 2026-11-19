import { DURATION_BY_TYPE, TOTAL_QUESTIONS } from './config'
import type { PrivateQuestion, PublicQuestion, QuestionInput } from './types'

export interface SplitQuestion {
  pub: PublicQuestion
  priv: PrivateQuestion
}

/**
 * インポートされた問題を検証し、公開部分と非公開部分に分ける。
 * 制限時間は問題タイプから自動で決める(入力値は無視)。
 * 問題IDは q01〜q20 に振り直す(IDから正解が推測できないよう、選択肢IDも c1〜c4 等に振り直す)。
 */
export function validateAndSplit(input: unknown, requireExactCount = true): SplitQuestion[] {
  if (!Array.isArray(input)) throw new Error('問題データは配列(リスト)で入力してください')
  if (requireExactCount && input.length !== TOTAL_QUESTIONS)
    throw new Error(`問題は${TOTAL_QUESTIONS}問ちょうど必要です(今は${input.length}問)`)
  const sorted = [...(input as QuestionInput[])].sort((a, b) => a.position - b.position)
  return sorted.map((q, i) => {
    const n = i + 1
    const where = `${n}問目`
    if (q.position !== n) throw new Error(`${where}: position は1から順番に重複なく付けてください`)
    if (q.type !== 'multiple_choice' && q.type !== 'ordering')
      throw new Error(`${where}: type は multiple_choice か ordering です`)
    if (!q.prompt || typeof q.prompt !== 'string') throw new Error(`${where}: 問題文(prompt)がありません`)
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
    if (q.difficulty) priv.difficulty = String(q.difficulty)
    if (q.genre) priv.genre = String(q.genre)
    if (q.tone) priv.tone = String(q.tone)
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
      durationSec: DURATION_BY_TYPE[q.type],
    }
    if (q.imageUrl) pub.imageUrl = String(q.imageUrl)
    if (q.imageAlt) pub.imageAlt = String(q.imageAlt)
    return { pub, priv }
  })
}

/** 編集用に公開+非公開を1つにまとめ直す(エクスポート用) */
export function mergeForExport(pub: PublicQuestion, priv: PrivateQuestion): QuestionInput {
  const { id: _id, durationSec: _d, ...rest } = pub
  return { ...rest, ...priv }
}
