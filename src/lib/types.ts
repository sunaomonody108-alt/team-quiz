import type { Timestamp } from 'firebase/firestore'

export type QuestionType = 'multiple_choice' | 'ordering' | 'text_input'

export interface Choice {
  id: string
  label: string
}

/** 参加者・会場に見せてよい部分(正解は含めない) */
export interface PublicQuestion {
  id: string
  position: number
  type: QuestionType
  prompt: string
  imageUrl?: string
  imageAlt?: string
  choices: Choice[]
  durationSec: number
}

/** 管理者だけが読める部分 */
export interface PrivateQuestion {
  correctChoiceId?: string
  correctOrderIds?: string[]
  /** 自由記述の正解(表記ゆれを複数登録できる。かな/カナ・全角半角・空白は自動で同一視) */
  acceptedAnswers?: string[]
  explanation: string
  difficulty?: string
  genre?: string
  tone?: string
}

/** 管理画面でのインポート用(公開+非公開を1つにまとめた形) */
export interface QuestionInput extends Omit<PublicQuestion, 'durationSec' | 'id'>, PrivateQuestion {
  id?: string
  durationSec?: number
}

export type Phase =
  | 'setup' // 未開始
  | 'registration' // 受付中
  | 'waiting' // 問題待機(問題文は会場に表示中、まだ回答不可)
  | 'open' // 出題中
  | 'closed' // 締切(正解発表待ち)
  | 'revealed' // 正解発表
  | 'interim' // 途中順位
  | 'finished' // その日の終了

/** 日ごとの進行状態(参加者も読める公開ドキュメント) */
export interface DayState {
  dayNumber: 1 | 2
  phase: Phase
  registrationOpen: boolean
  questionPosition: number // 1..totalQuestions、未開始は0
  totalQuestions: number
  currentQuestion: (PublicQuestion & { choiceIds: string[] }) | null
  startedAt: Timestamp | null
  rankingId: string | null
  updatedAt?: Timestamp
}

export type InterimMode = 'none' | 'half' | 'every5'

export interface EventSettings {
  /** [未決定] 正解発表後、スマホに正解と解説まで出すか(false なら正誤のみ) */
  showExplanationOnPhone: boolean
  /** [未決定] チーム名の重複判定範囲 */
  teamNameScope: 'day' | 'event'
  /** 旧仕様(20問固定)の途中順位の問題番号。interimMode が無い古いデータ用に残す */
  interimAfter: number[]
  /** 途中順位の出し方: none=出さない / half=真ん中で1回 / every5=5問ごと。未設定は half */
  interimMode?: InterimMode
  /** [確定] 会場に出す順位の範囲(途中・1日目終了) */
  venueTopRank: number
  /** [未決定] 総合結果を会場に何位まで出すか(Phase 2 で使用) */
  finalVenueTopRank: number
}

export interface EventDoc {
  name: string
  settings: EventSettings
  questionsLocked: boolean
}

export interface TeamDoc {
  displayName: string
  nameKey: string
  uid: string
  dayId: string
  createdAt: Timestamp
}

export interface AnswerDoc {
  teamId: string
  questionId: string
  choiceId?: string
  orderIds?: string[]
  text?: string
  revision: number
  updatedAt: Timestamp
}

export interface MarkDoc {
  teamId: string
  questionId: string
  answered: boolean
  isCorrect: boolean
}

export interface TeamResultDoc {
  teamId: string
  displayName: string
  score: number
  lastQuestionId: string | null
  rank: number | null
}

export interface RevealDoc {
  questionId: string
  type: QuestionType
  correctChoiceId?: string
  correctOrderIds?: string[]
  acceptedAnswers?: string[]
  explanation: string
}

export interface RankingEntry {
  rank: number
  displayName: string
  score: number
}

export interface PublicRankingDoc {
  scope: 'interim' | 'day-final' | 'overall'
  afterPosition: number
  displayedTopRank: number
  entries: RankingEntry[]
}
