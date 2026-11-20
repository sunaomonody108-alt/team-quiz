import type { EventSettings, InterimMode, QuestionType } from './types'

/** 問題タイプごとの制限時間(秒)の初期値。問題データに durationSec があればそちらを使う */
export const DURATION_BY_TYPE: Record<QuestionType, number> = {
  multiple_choice: 20,
  ordering: 30,
  text_input: 180,
}

/** 問題数の上限・下限(2026-11-20 変更: 20問固定 → 謎解き向けに少ない問題数も可) */
export const MIN_QUESTIONS = 3
export const MAX_QUESTIONS = 20
/** 進行ドキュメント作成時の仮の問題数。実際の問題数は「受付を締め切って開始」時に登録済みの問題数で上書きする */
export const TOTAL_QUESTIONS = 20

/** 問題ごとの制限時間の範囲(秒) */
export const MIN_DURATION_SEC = 10
export const MAX_DURATION_SEC = 600

/** 途中順位を出す問題番号(最終問題の後は出さない) */
export function interimPositions(total: number, mode: InterimMode | undefined): number[] {
  const m = mode ?? 'half'
  if (m === 'none' || total < 4) return []
  if (m === 'half') return [Math.ceil(total / 2)]
  const out: number[] = []
  for (let i = 5; i < total; i += 5) out.push(i)
  return out
}

export const DAY_IDS = ['day1', 'day2'] as const
export type DayId = (typeof DAY_IDS)[number]

/**
 * 初期設定。[未決定] の項目は仮の値で、管理画面から変更できる。
 * README の「仮仕様」節も参照。
 */
export const DEFAULT_SETTINGS: EventSettings = {
  showExplanationOnPhone: true, // [未決定] 暫定は「正誤+正解+解説」
  teamNameScope: 'day', // [未決定] 暫定は「同じ日の中で重複不可」
  interimAfter: [5, 10, 15], // 旧仕様。interimMode を優先
  interimMode: 'half',
  venueTopRank: 3, // [確定]
  finalVenueTopRank: 3, // [未決定] 暫定は3位まで
}

/** 自由記述の最大文字数 */
export const MAX_TEXT_ANSWER = 40

/** 秒を「2:30」「45秒」のように表示 */
export function formatSec(sec: number): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m}分${s}秒` : `${m}分`
}

export const TYPE_LABEL: Record<QuestionType, string> = {
  multiple_choice: '4択',
  ordering: '並べ替え',
  text_input: '自由記述',
}

export const EVENT_ID: string = import.meta.env?.VITE_EVENT_ID || 'main'
