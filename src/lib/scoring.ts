import { answerKey } from './normalize'
import type { AnswerDoc, PrivateQuestion, QuestionType } from './types'

/** 1問の正誤判定。部分点なし。並べ替えは完全一致のみ正解 */
export function judge(
  type: QuestionType,
  correct: Pick<PrivateQuestion, 'correctChoiceId' | 'correctOrderIds' | 'acceptedAnswers'>,
  answer: Pick<AnswerDoc, 'choiceId' | 'orderIds' | 'text'> | null | undefined,
): { answered: boolean; isCorrect: boolean } {
  if (!answer) return { answered: false, isCorrect: false }
  if (type === 'text_input') {
    const got = answerKey(answer.text ?? '')
    if (!got) return { answered: false, isCorrect: false }
    return { answered: true, isCorrect: (correct.acceptedAnswers ?? []).some((a) => answerKey(a) === got) }
  }
  if (type === 'multiple_choice') {
    if (!answer.choiceId) return { answered: false, isCorrect: false }
    return { answered: true, isCorrect: answer.choiceId === correct.correctChoiceId }
  }
  const got = answer.orderIds
  const want = correct.correctOrderIds
  if (!got || !want || got.length !== want.length) return { answered: false, isCorrect: false }
  return { answered: true, isCorrect: got.every((id, i) => id === want[i]) }
}
