import type { RankingEntry } from './types'

export interface RankInput {
  teamId: string
  displayName: string
  score: number
  /** 総合順位でだけ使う。小さいほど上位。未計測は Infinity 扱い */
  stopwatchErrorMs?: number | null
}

export interface Ranked extends RankInput {
  rank: number
}

/**
 * 競技順位方式(1,1,3)。
 * useStopwatch=false のとき(途中・1日目終了)はストップウォッチで同点を分けない。
 */
export function competitionRank(teams: RankInput[], useStopwatch: boolean): Ranked[] {
  const err = (t: RankInput) =>
    t.stopwatchErrorMs === null || t.stopwatchErrorMs === undefined ? Number.POSITIVE_INFINITY : t.stopwatchErrorMs
  const outranks = (a: RankInput, b: RankInput) => {
    if (a.score !== b.score) return a.score > b.score
    if (!useStopwatch) return false
    return err(a) < err(b)
  }
  const ranked = teams.map((t) => ({
    ...t,
    rank: 1 + teams.filter((o) => outranks(o, t)).length,
  }))
  return ranked.sort(
    (a, b) => a.rank - b.rank || a.displayName.localeCompare(b.displayName, 'ja'),
  )
}

/** 指定順位以内(同率含む)だけを取り出す */
export function topWithTies(ranked: Ranked[], topRank: number): RankingEntry[] {
  return ranked
    .filter((t) => t.rank <= topRank)
    .map((t) => ({ rank: t.rank, displayName: t.displayName, score: t.score }))
}
