import { describe, expect, it } from 'vitest'
import { validateAndSplit } from '../../src/lib/questions'
import { teamNameKey } from '../../src/lib/normalize'
import { MOCK_QUESTIONS } from '../../src/mock/questions'

describe('問題データ', () => {
  it('モック20問は検証を通り、15問が4択・5問が並べ替え', () => {
    const s = validateAndSplit(MOCK_QUESTIONS)
    expect(s).toHaveLength(20)
    expect(s.filter((q) => q.pub.type === 'multiple_choice')).toHaveLength(15)
    expect(s.filter((q) => q.pub.type === 'ordering')).toHaveLength(5)
  })
  it('制限時間は問題タイプから自動決定(4択20秒/並べ替え30秒)', () => {
    const s = validateAndSplit(MOCK_QUESTIONS.map((q) => ({ ...q, durationSec: 999 })))
    for (const q of s) expect(q.pub.durationSec).toBe(q.pub.type === 'ordering' ? 30 : 20)
  })
  it('公開データに正解・解説が入らない', () => {
    for (const { pub } of validateAndSplit(MOCK_QUESTIONS)) {
      const json = JSON.stringify(pub)
      expect(json).not.toMatch(/correct|explanation/)
    }
  })
  it('選択肢IDは振り直され、元のIDから正解を推測できない', () => {
    const qs = structuredClone(MOCK_QUESTIONS)
    qs[0].choices = qs[0].choices.map((c, i) => ({ ...c, id: i === 0 ? 'seikai' : `x${i}` }))
    qs[0].correctChoiceId = 'seikai'
    const [first] = validateAndSplit(qs)
    expect(first.pub.choices.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(first.priv.correctChoiceId).toBe('c1')
  })
  it('並べ替えの正解が選択肢と合わないと拒否', () => {
    const qs = structuredClone(MOCK_QUESTIONS)
    qs[3].correctOrderIds = ['o1', 'o2', 'o3']
    expect(() => validateAndSplit(qs)).toThrow(/correctOrderIds/)
  })
  it('20問ちょうどでないと拒否', () => {
    expect(() => validateAndSplit(MOCK_QUESTIONS.slice(0, 19))).toThrow(/20問/)
  })
})

describe('チーム名の重複判定キー', () => {
  it('全角半角・大文字小文字・空白の違いは同じ名前', () => {
    expect(teamNameKey('Ｔｅａｍ　Ａ')).toBe(teamNameKey('team a'))
    expect(teamNameKey(' チーム1 ')).toBe(teamNameKey('チーム１'))
  })
})
