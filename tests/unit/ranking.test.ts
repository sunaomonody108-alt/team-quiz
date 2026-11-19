import { describe, expect, it } from 'vitest'
import { competitionRank, topWithTies } from '../../src/lib/ranking'

const t = (name: string, score: number, err?: number | null) => ({ teamId: name, displayName: name, score, stopwatchErrorMs: err })

describe('競技順位方式', () => {
  it('同点は同順位、次は人数分飛ばす(1,1,3)', () => {
    const r = competitionRank([t('A', 10), t('B', 10), t('C', 8), t('D', 7)], false)
    expect(r.map((x) => [x.displayName, x.rank])).toEqual([['A', 1], ['B', 1], ['C', 3], ['D', 4]])
  })
  it('1,2,2,4', () => {
    const r = competitionRank([t('A', 10), t('B', 9), t('C', 9), t('D', 7)], false)
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4])
  })
  it('T12: 途中・1日目終了ではストップウォッチで同点を分けない', () => {
    const r = competitionRank([t('A', 10, 500), t('B', 10, 10)], false)
    expect(r.map((x) => x.rank)).toEqual([1, 1])
  })
  it('T13: 総合では同点ならストップウォッチ誤差が小さい方が上', () => {
    const r = competitionRank([t('A', 10, 500), t('B', 10, 10), t('C', 11, 9999)], true)
    expect(r.map((x) => [x.displayName, x.rank])).toEqual([['C', 1], ['B', 2], ['A', 3]])
  })
  it('T14: 得点も誤差も同じなら同順位', () => {
    const r = competitionRank([t('A', 10, 30), t('B', 10, 30), t('C', 9, 0)], true)
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3])
  })
  it('総合で未計測は最下位扱い', () => {
    const r = competitionRank([t('A', 10, null), t('B', 10, 9000)], true)
    expect(r.map((x) => x.displayName)).toEqual(['B', 'A'])
  })
  it('T11: 会場は3位まで、同率は全員表示', () => {
    const r = competitionRank([t('A', 10), t('B', 9), t('C', 8), t('D', 8), t('E', 8), t('F', 7)], false)
    expect(topWithTies(r, 3).map((x) => x.displayName)).toEqual(['A', 'B', 'C', 'D', 'E'])
    const r2 = competitionRank([t('A', 10), t('B', 10), t('C', 10), t('D', 10), t('E', 1)], false)
    expect(topWithTies(r2, 3)).toHaveLength(4)
  })
})
