import { interimPositions } from '../lib/config'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AdminGate } from '../components/AdminGate'
import { Countdown, QuestionView, RankingList } from '../components/QuestionView'
import { Button, Notice } from '../components/ui'
import { deadlineMs } from '../lib/clock'
import { EVENT_ID } from '../lib/config'
import { db } from '../lib/firebase'
import {
  closeQuestion,
  countAnswered,
  countTeams,
  ensureRanking,
  hostNext,
  revealAnswer,
  setRegistration,
  StaleError,
  startQuestion,
  startQuiz,
} from '../lib/host'
import { useDocData, useNow, usePoll, useServerOffset } from '../lib/hooks'
import { p } from '../lib/paths'
import type { DayState, EventDoc, PublicRankingDoc, RevealDoc } from '../lib/types'

const E = EVENT_ID

export default function Host() {
  const { dayId = 'day1' } = useParams()
  return <AdminGate title="司会者画面ログイン">{(uid) => <HostScreen dayId={dayId} uid={uid} />}</AdminGate>
}

export function joinUrl(dayId: string) {
  return `${location.origin}${location.pathname}#/join/${dayId}`
}

/**
 * 司会者兼会場画面(プロジェクターに複製表示する)。
 * この画面では、氏名・回答内容・未発表の正解を購読しない。
 * 読むのは:進行状態(公開)/ 件数 / 正解発表(発表後のみ)/ 上位表。
 */
function HostScreen({ dayId, uid }: { dayId: string; uid: string }) {
  const day = useDocData<DayState>(p.day(db, E, dayId), `hday-${dayId}`)
  const ev = useDocData<EventDoc>(p.event(db, E), 'hev')
  const offset = useServerOffset(db, uid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function act(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      // 連打による「すでに進んでいます」は無視してよい
      if (!(e instanceof StaleError)) setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (day.loading) return <Frame><p className="text-2xl">読み込み中…</p></Frame>
  if (!day.data)
    return (
      <Frame>
        <Notice tone="warn">{dayId} の進行データがありません。管理画面で「イベントを初期化」してください。</Notice>
      </Frame>
    )
  const d = day.data
  const expected = { phase: d.phase, questionPosition: d.questionPosition }

  return (
    <Frame title={`${ev.data?.name ?? 'チーム対抗クイズ'} ${d.dayNumber}日目`} err={err}>
      {(d.phase === 'setup' || d.phase === 'registration') && (
        <Registration dayId={dayId} day={d} busy={busy} act={act} />
      )}
      {d.phase === 'waiting' && d.currentQuestion && (
        <>
          <QuestionView q={d.currentQuestion} />
          <Controls>
            <Button big disabled={busy} onClick={() => act(() => startQuestion(db, E, dayId))}>出題開始</Button>
          </Controls>
        </>
      )}
      {d.phase === 'open' && d.currentQuestion && (
        <OpenQuestion dayId={dayId} day={d} offset={offset} />
      )}
      {d.phase === 'closed' && d.currentQuestion && (
        <>
          <div className="rounded-3xl bg-slate-800 py-4 text-center text-5xl font-black text-white">回答締切</div>
          <QuestionView q={d.currentQuestion} />
          <Controls>
            <Button big disabled={busy} onClick={() => act(() => revealAnswer(db, E, dayId))}>正解発表</Button>
          </Controls>
        </>
      )}
      {d.phase === 'revealed' && d.currentQuestion && (
        <Revealed dayId={dayId} day={d} interimAfter={interimPositions(d.totalQuestions, ev.data?.settings?.interimMode)} busy={busy}
          onNext={() => act(() => hostNext(db, E, dayId, expected))} />
      )}
      {d.phase === 'interim' && (
        <>
          <Ranking dayId={dayId} day={d} title={`第${d.questionPosition}問までの順位`} />
          <Controls>
            <Button big disabled={busy} onClick={() => act(() => hostNext(db, E, dayId, expected))}>次の問題へ</Button>
          </Controls>
        </>
      )}
      {d.phase === 'finished' && <Ranking dayId={dayId} day={d} title={`${d.dayNumber}日目の結果`} />}
    </Frame>
  )
}

function Frame({ children, title, err }: { children: React.ReactNode; title?: string; err?: string | null }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-8 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {title && <p className="text-xl font-bold text-blue-700">{title}</p>}
        {err && <Notice tone="error">操作できませんでした:{err}</Notice>}
        {children}
      </div>
    </div>
  )
}

function Controls({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-4 pt-4">{children}</div>
}

function Registration({ dayId, day, busy, act }: { dayId: string; day: DayState; busy: boolean; act: (f: () => Promise<unknown>) => void }) {
  const count = usePoll(() => countTeams(db, E, dayId), 2000, `teams-${dayId}`)
  const url = joinUrl(dayId)
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 ring-1 ring-blue-100">
        {day.registrationOpen ? (
          <>
            <QRCodeSVG value={url} size={360} marginSize={2} />
            <p className="break-all text-center text-sm text-slate-500">{url}</p>
          </>
        ) : (
          <p className="py-24 text-2xl text-slate-500">受付はまだ始まっていません</p>
        )}
      </div>
      <div className="space-y-6 text-center">
        <h1 className="text-5xl font-black text-blue-700">チーム登録</h1>
        <p className="text-2xl">代表者のスマホでQRコードを読み取り、チーム名と3人の名前を登録してください。</p>
        <p className="text-6xl font-black tabular-nums">{count ?? '–'}<span className="text-3xl"> チーム登録済み</span></p>
        <Controls>
          {!day.registrationOpen ? (
            <Button big disabled={busy} onClick={() => act(() => setRegistration(db, E, dayId, true))}>受付を開始</Button>
          ) : (
            <>
              <Button big disabled={busy || !count} onClick={() => {
                if (confirm(`${count}チームで受付を締め切って開始します。よろしいですか?(この後は登録できません)`))
                  act(() => startQuiz(db, E, dayId))
              }}>受付を締め切って開始</Button>
              <Button variant="secondary" disabled={busy} onClick={() => act(() => setRegistration(db, E, dayId, false))}>受付を一時停止</Button>
            </>
          )}
        </Controls>
      </div>
    </div>
  )
}

function OpenQuestion({ dayId, day, offset }: { dayId: string; day: DayState; offset: number }) {
  const q = day.currentQuestion!
  const now = useNow(100) + offset
  const deadline = deadlineMs(day.startedAt, q.durationSec)
  const remaining = deadline ? deadline - now : q.durationSec * 1000
  const answered = usePoll(() => countAnswered(db, E, dayId, q.id), 1500, `ans-${q.id}`)
  const total = usePoll(() => countTeams(db, E, dayId), 30000, `tt-${dayId}`)
  const closing = useRef(false)
  const [closeErr, setCloseErr] = useState(false)

  // 締切は自動。サーバー時刻で締切を過ぎてからでないとルールで拒否されるので、少し余裕を持って実行し、失敗したら再試行
  useEffect(() => {
    if (!deadline || remaining > -300 || closing.current) return
    closing.current = true
    closeQuestion(db, E, dayId)
      .then(() => setCloseErr(false))
      .catch((e) => {
        if (!(e instanceof StaleError)) setCloseErr(true)
      })
      .finally(() => setTimeout(() => (closing.current = false), 1000))
  }, [deadline, remaining, dayId])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-[1fr_auto] items-center gap-8">
        <Countdown remainingMs={remaining} totalSec={q.durationSec} />
        <div className="rounded-3xl bg-white px-8 py-4 text-center ring-1 ring-blue-100">
          <p className="text-lg text-slate-600">回答済み</p>
          <p className="text-5xl font-black tabular-nums">{answered ?? '–'}<span className="text-2xl"> / {total ?? '–'}</span></p>
        </div>
      </div>
      <QuestionView q={q} />
      {closeErr && <Notice tone="warn">締切処理を再試行しています…</Notice>}
    </div>
  )
}

function Revealed({ dayId, day, interimAfter, busy, onNext }: { dayId: string; day: DayState; interimAfter: number[]; busy: boolean; onNext: () => void }) {
  const q = day.currentQuestion!
  const reveal = useDocData<RevealDoc>(p.reveal(db, E, dayId, q.id), `hrev-${q.id}`)
  const pos = day.questionPosition
  const label = pos >= day.totalQuestions ? '結果発表へ' : interimAfter.includes(pos) ? '途中順位へ' : '次の問題へ'
  return (
    <>
      <div className="rounded-3xl bg-emerald-500 py-4 text-center text-5xl font-black text-white">正解発表</div>
      <QuestionView q={q} reveal={reveal.data} />
      <Controls>
        <Button big disabled={busy} onClick={onNext}>{label}</Button>
      </Controls>
    </>
  )
}

function Ranking({ dayId, day, title }: { dayId: string; day: DayState; title: string }) {
  const rk = useDocData<PublicRankingDoc>(day.rankingId ? p.ranking(db, E, dayId, day.rankingId) : null, `hrk-${day.rankingId}`)
  useEffect(() => {
    // 「次へ」のあと順位の書き込み前に司会PCが落ちた場合に備えて、無ければ作り直す
    if (!rk.loading && !rk.exists) ensureRanking(db, E, dayId).catch(() => {})
  }, [rk.loading, rk.exists, dayId])
  return <RankingList title={title} entries={rk.data?.entries ?? []} />
}
