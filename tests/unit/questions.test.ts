import { describe, expect, it } from 'vitest'
import { normalizeImageUrl, validateAndSplit } from '../../src/lib/questions'
import { answerKey } from '../../src/lib/normalize'
import { judge } from '../../src/lib/scoring'
import { interimPositions } from '../../src/lib/config'
import { teamNameKey } from '../../src/lib/normalize'
import { MOCK_QUESTIONS } from '../../src/mock/questions'

describe('問題データ', () => {
  it('モック20問は検証を通り、15問が4択・5問が並べ替え', () => {
    const s = validateAndSplit(MOCK_QUESTIONS)
    expect(s).toHaveLength(20)
    expect(s.filter((q) => q.pub.type === 'multiple_choice')).toHaveLength(15)
    expect(s.filter((q) => q.pub.type === 'ordering')).toHaveLength(5)
  })
  it('制限時間は省略時はタイプの初期値(4択20秒/並べ替え30秒)', () => {
    const s = validateAndSplit(MOCK_QUESTIONS.map(({ durationSec: _d, ...q }) => q))
    for (const q of s) expect(q.pub.durationSec).toBe(q.pub.type === 'ordering' ? 30 : 20)
  })
  it('durationSec を指定すればその秒数。範囲外は拒否', () => {
    const s = validateAndSplit(MOCK_QUESTIONS.map((q) => ({ ...q, durationSec: 150 })))
    for (const q of s) expect(q.pub.durationSec).toBe(150)
    expect(() => validateAndSplit(MOCK_QUESTIONS.map((q) => ({ ...q, durationSec: 999 })))).toThrow(/durationSec/)
    expect(() => validateAndSplit(MOCK_QUESTIONS.map((q) => ({ ...q, durationSec: 5 })))).toThrow(/durationSec/)
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
  it('問題数は3〜20問', () => {
    expect(validateAndSplit(MOCK_QUESTIONS.slice(0, 6))).toHaveLength(6)
    expect(() => validateAndSplit(MOCK_QUESTIONS.slice(0, 2))).toThrow(/3〜20問/)
    expect(() => validateAndSplit([...MOCK_QUESTIONS, { ...MOCK_QUESTIONS[0], position: 21 }])).toThrow(/3〜20問/)
  })
})

describe('チーム名の重複判定キー', () => {
  it('全角半角・大文字小文字・空白の違いは同じ名前', () => {
    expect(teamNameKey('Ｔｅａｍ　Ａ')).toBe(teamNameKey('team a'))
    expect(teamNameKey(' チーム1 ')).toBe(teamNameKey('チーム１'))
  })
})

describe('問題の種類数と画像パス', () => {
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

describe('自由記述', () => {
  const textQ = (extra: object = {}) => [
    { position: 1, type: 'text_input', prompt: '謎', acceptedAnswers: ['りんご', '林檎'], explanation: 'x', ...extra },
    ...MOCK_QUESTIONS.slice(1, 5),
  ]
  it('選択肢なし・正解は非公開側だけ・制限時間の初期値は3分', () => {
    const [q] = validateAndSplit(textQ())
    expect(q.pub.choices).toEqual([])
    expect(q.pub.durationSec).toBe(180)
    expect(JSON.stringify(q.pub)).not.toMatch(/りんご|林檎|accepted/)
    expect(q.priv.acceptedAnswers).toEqual(['りんご', '林檎'])
  })
  it('answer 1つだけの書き方も受け付ける', () => {
    const [q] = validateAndSplit(textQ({ acceptedAnswers: undefined, answer: 'みかん' }))
    expect(q.priv.acceptedAnswers).toEqual(['みかん'])
  })
  it('正解が無いと拒否', () => {
    expect(() => validateAndSplit(textQ({ acceptedAnswers: [] }))).toThrow(/acceptedAnswers/)
    expect(() => validateAndSplit(textQ({ acceptedAnswers: ['  '] }))).toThrow(/空の正解/)
  })
  it('かな/カナ・全角半角・空白・記号の違いは同じ扱い', () => {
    expect(answerKey('リンゴ')).toBe(answerKey('りんご'))
    expect(answerKey(' り ん ご！')).toBe(answerKey('りんご'))
    expect(answerKey('ＡＢＣ')).toBe(answerKey('abc'))
    expect(answerKey('ｶﾀｶﾅ')).toBe(answerKey('かたかな'))
    expect(answerKey('コーヒー')).toBe(answerKey('こーひー'))
  })
  it('採点:登録した書き方のどれかに一致すれば正解', () => {
    const c = { acceptedAnswers: ['りんご', '林檎'] }
    expect(judge('text_input', c, { text: 'リンゴ' })).toEqual({ answered: true, isCorrect: true })
    expect(judge('text_input', c, { text: '林檎' })).toEqual({ answered: true, isCorrect: true })
    expect(judge('text_input', c, { text: 'みかん' })).toEqual({ answered: true, isCorrect: false })
    expect(judge('text_input', c, { text: '  ' })).toEqual({ answered: false, isCorrect: false })
    expect(judge('text_input', c, null)).toEqual({ answered: false, isCorrect: false })
  })
})

describe('途中順位のタイミング', () => {
  it('真ん中で1回', () => {
    expect(interimPositions(6, 'half')).toEqual([3])
    expect(interimPositions(7, 'half')).toEqual([4])
    expect(interimPositions(5, undefined)).toEqual([3])
  })
  it('5問ごと・なし', () => {
    expect(interimPositions(20, 'every5')).toEqual([5, 10, 15])
    expect(interimPositions(6, 'every5')).toEqual([5])
    expect(interimPositions(6, 'none')).toEqual([])
    expect(interimPositions(3, 'half')).toEqual([])
  })
})
