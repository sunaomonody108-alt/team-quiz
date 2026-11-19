import type { EventSettings, QuestionType } from './types'

/** [確定] 問題タイプごとの制限時間(秒) */
export const DURATION_BY_TYPE: Record<QuestionType, number> = {
  multiple_choice: 20,
  ordering: 30,
}

/** [確定] 問題数 */
export const TOTAL_QUESTIONS = 20

export const DAY_IDS = ['day1', 'day2'] as const
export type DayId = (typeof DAY_IDS)[number]

/**
 * 初期設定。[未決定] の項目は仮の値で、管理画面から変更できる。
 * README の「仮仕様」節も参照。
 */
export const DEFAULT_SETTINGS: EventSettings = {
  showExplanationOnPhone: true, // [未決定] 暫定は「正誤+正解+解説」
  teamNameScope: 'day', // [未決定] 暫定は「同じ日の中で重複不可」
  interimAfter: [5, 10, 15], // [確定]
  venueTopRank: 3, // [確定]
  finalVenueTopRank: 3, // [未決定] 暫定は3位まで
}

export const EVENT_ID: string = import.meta.env?.VITE_EVENT_ID || 'main'
