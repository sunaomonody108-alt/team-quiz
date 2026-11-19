import { describe, expect, it } from 'vitest'
import { normalizeImageUrl, validateAndSplit } from '../../src/lib/questions'
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

describe('問題の種類数と画像パス', () => {
  it('4択15問・並べ替え5問でないと拒否', () => {
    const qs = structuredClone(MOCK_QUESTIONS)
    const i = qs.findIndex((q) => q.type === 'ordering')
    qs[i] = { ...qs[i], type: 'multiple_choice', choices: qs[i].choices.slice(0, 4).concat(qs[i].choices.length < 4 ? [{ id: 'zz', label: 'z' }] : []), correctChoiceId: qs[i].choices[0].id }
    expect(() => validateAndSplit(qs)).toThrow(/4択は15問|並べ替えは5問/)
  })
  it('先頭スラッシュの画像パスはアプリ相対にする(GitHub Pagesのサブパス対策)', () => {
    expect(normalizeImageUrl('/quiz-assets/q02.svg')).toBe('quiz-assets/q02.svg')
    expect(normalizeImageUrl('./quiz-assets/q07.svg')).toBe('quiz-assets/q07.svg')
    expect(normalizeImageUrl('quiz-assets/q13.svg')).toBe('quiz-assets/q13.svg')
    expect(normalizeImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
  })
  it('javascript: や http: の画像は拒否', () => {
    expect(() => normalizeImageUrl('javascript:alert(1)')).toThrow()
    expect(() => normalizeImageUrl('http://example.com/a.png')).toThrow()
    expect(() => normalizeImageUrl('//evil.example/a.png')).toThrow()
  })
  it('インポート時に画像パスが整えられ、公開データに残る', () => {
    const qs = structuredClone(MOCK_QUESTIONS)
    qs[1] = { ...qs[1], imageUrl: '/quiz-assets/q02.svg', imageAlt: '図' }
    const s = validateAndSplit(qs)
    expect(s[1].pub.imageUrl).toBe('quiz-assets/q02.svg')
    expect(s[1].pub.imageAlt).toBe('図')
  })
})
