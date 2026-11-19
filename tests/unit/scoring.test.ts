import { describe, expect, it } from 'vitest'
import { judge } from '../../src/lib/scoring'

describe('採点', () => {
  it('4択', () => {
    expect(judge('multiple_choice', { correctChoiceId: 'c2' }, { choiceId: 'c2' })).toEqual({ answered: true, isCorrect: true })
    expect(judge('multiple_choice', { correctChoiceId: 'c2' }, { choiceId: 'c1' })).toEqual({ answered: true, isCorrect: false })
  })
  it('T08: 未回答は0点・未回答扱い', () => {
    expect(judge('multiple_choice', { correctChoiceId: 'c2' }, undefined)).toEqual({ answered: false, isCorrect: false })
    expect(judge('ordering', { correctOrderIds: ['a', 'b'] }, { orderIds: ['a'] })).toEqual({ answered: false, isCorrect: false })
  })
  it('並べ替えは完全一致のみ正解(部分点なし)', () => {
    const c = { correctOrderIds: ['c1', 'c2', 'c3', 'c4'] }
    expect(judge('ordering', c, { orderIds: ['c1', 'c2', 'c3', 'c4'] }).isCorrect).toBe(true)
    expect(judge('ordering', c, { orderIds: ['c1', 'c2', 'c4', 'c3'] }).isCorrect).toBe(false)
  })
})
