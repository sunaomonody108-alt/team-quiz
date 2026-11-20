import { useEffect, useMemo, useRef, useState } from 'react'
import { CHOICE_MARKS } from '../lib/marks'
import { MAX_TEXT_ANSWER } from '../lib/config'
import { clock } from '../components/QuestionView'
import { useParams } from 'react-router-dom'
import { Button, Card, Field, Notice, Screen } from '../components/ui'
import { deadlineMs } from '../lib/clock'
import { EVENT_ID } from '../lib/config'
import { db } from '../lib/firebase'
import { useAnonymousUser, useDocData, useNow, useServerOffset } from '../lib/hooks'
import { answerDocId } from '../lib/normalize'
import { nextRevision, registerTeam, submitAnswer, UserError } from '../lib/participant'
import { p } from '../lib/paths'
import type {
  AnswerDoc,
  DayState,
  EventDoc,
  MarkDoc,
  RevealDoc,
  TeamDoc,
  TeamResultDoc,
} from '../lib/types'

const E = EVENT_ID

export default function Join() {
  const { dayId = 'day1' } = useParams()
  const { user, error } = useAnonymousUser()
  const uid = user?.uid
  const team = useDocData<TeamDoc>(uid ? p.team(db, E, dayId, uid) : null, `team-${dayId}-${uid}`)
  // 送信中(端末内だけ)の登録は「登録済み」と扱わない。拒否されると消えるため
  const registered = team.exists && team.fromServer
  const day = useDocData<DayState>(uid ? p.day(db, E, dayId) : null, `day-${dayId}-${uid}-${registered}`)
  const ev = useDocData<EventDoc>(uid ? p.event(db, E) : null, `ev-${uid}`)

  if (error) return <Screen><Notice tone="error">接続できませんでした。電波の良い場所で再読み込みしてください。({error})</Notice></Screen>
  if (!uid || team.loading) return <Screen><p className="py-20 text-center text-xl">接続中…</p></Screen>

  if (!registered) {
    if (day.loading && !day.data) return <Screen><p className="py-20 text-center text-xl">接続中…</p></Screen>
    if (!day.data?.registrationOpen)
      return (
        <Screen>
          <Card className="space-y-3 text-center">
            <h1 className="text-2xl font-black text-blue-700">{ev.data?.name ?? 'チーム対抗クイズ'}</h1>
            <p className="text-lg">いまは参加受付をしていません。</p>
            <p className="text-slate-600">受付が始まったら、もう一度QRコードを読み取るか、この画面を再読み込みしてください。</p>
          </Card>
        </Screen>
      )
    return <Register dayId={dayId} uid={uid} eventName={ev.data?.name} />
  }

  return (
    <Screen>
      <div className="mb-4 flex items-center justify-between">
        <span className="truncate text-lg font-black text-blue-700">{team.data?.displayName}</span>
        <span className="text-sm text-slate-500">{day.data?.dayNumber}日目</span>
      </div>
      {day.data ? (
        <Play dayId={dayId} uid={uid} day={day.data} showExplanation={ev.data?.settings?.showExplanationOnPhone ?? true} />
      ) : (
        <p className="py-20 text-center">読み込み中…</p>
      )}
    </Screen>
  )
}

function Register({ dayId, uid, eventName }: { dayId: string; uid: string; eventName?: string }) {
  const [name, setName] = useState('')
  const [members, setMembers] = useState(['', '', ''])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ok = name.trim() && members.every((m) => m.trim())
  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await registerTeam(db, E, dayId, uid, name, members)
    } catch (e) {
      setErr(e instanceof UserError ? e.message : '通信エラーで登録できませんでした。もう一度押してください。')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Screen>
      <Card className="space-y-5">
        <div>
          <p className="text-sm text-slate-500">{eventName ?? 'チーム対抗クイズ'}</p>
          <h1 className="text-3xl font-black text-blue-700">チーム登録</h1>
        </div>
        <Field label="チーム名(自由)" value={name} onChange={setName} placeholder="例:チーム ねこ" />
        {members.map((m, i) => (
          <Field
            key={i}
            label={`メンバー${i + 1}の名前`}
            value={m}
            onChange={(v) => setMembers(members.map((x, k) => (k === i ? v : x)))}
          />
        ))}
        <p className="text-sm text-slate-600">
          名前は運営が成績・景品の確認に使います。会場の画面や他のチームには表示されません。登録後の修正は司会者に伝えてください。
        </p>
        {err && <Notice tone="error">{err}</Notice>}
        <Button big className="w-full" disabled={!ok || busy} onClick={submit}>
          {busy ? '登録中…' : 'この内容で登録'}
        </Button>
      </Card>
    </Screen>
  )
}

function Play({ dayId, uid, day, showExplanation }: { dayId: string; uid: string; day: DayState; showExplanation: boolean }) {
  const q = day.currentQuestion
  switch (day.phase) {
    case 'setup':
    case 'registration':
      return (
        <Card className="space-y-3 py-10 text-center">
          <p className="text-2xl font-black text-emerald-600">登録できました</p>
          <p className="text-lg">司会者の開始をお待ちください。</p>
          <p className="text-sm text-slate-500">この画面は閉じても大丈夫です。同じスマホで開き直せば戻れます。</p>
        </Card>
      )
    case 'waiting':
      return (
        <Card className="space-y-3 py-10 text-center">
          <p className="text-xl font-bold text-blue-700">第{day.questionPosition}問</p>
          <p className="text-lg">まもなく出題します。画面を見ていてください。</p>
        </Card>
      )
    case 'open':
      return q ? <AnswerPanel key={q.id} dayId={dayId} uid={uid} day={day} /> : null
    case 'closed':
      return q ? <ClosedPanel dayId={dayId} uid={uid} day={day} /> : null
    case 'revealed':
      return q ? <RevealPanel dayId={dayId} uid={uid} day={day} showExplanation={showExplanation} /> : null
    case 'interim':
      return <RankPanel dayId={dayId} uid={uid} title={`第${day.questionPosition}問までの結果`} />
    case 'finished':
      return <RankPanel dayId={dayId} uid={uid} title="本日の結果" finished />
  }
}

/** サーバーに保存済みの自分の回答 */
function useMyAnswer(dayId: string, uid: string, questionId: string) {
  return useDocData<AnswerDoc>(p.answer(db, E, dayId, answerDocId(uid, questionId)), `ans-${dayId}-${uid}-${questionId}`)
}

type SendState = 'idle' | 'sending' | 'saved' | 'error' | 'late'

function AnswerPanel({ dayId, uid, day }: { dayId: string; uid: string; day: DayState }) {
  const q = day.currentQuestion!
  const offset = useServerOffset(db, uid)
  const now = useNow(200) + offset
  const deadline = deadlineMs(day.startedAt, q.durationSec)
  const remaining = deadline ? deadline - now : q.durationSec * 1000
  const timeUp = remaining <= 0
  const saved = useMyAnswer(dayId, uid, q.id)
  const [send, setSend] = useState<SendState>('idle')
  const latest = useRef(0)

  async function send_(payload: { choiceId?: string; orderIds?: string[]; text?: string }) {
    if (timeUp) return
    const rev = nextRevision()
    latest.current = rev
    setSend('sending')
    try {
      await submitAnswer(db, E, dayId, uid, rev, { questionId: q.id, ...payload })
      if (latest.current === rev) setSend('saved')
    } catch {
      if (latest.current === rev) setSend(Date.now() + offset >= (deadline ?? 0) ? 'late' : 'error')
    }
  }

  const serverAnswer = saved.fromServer && saved.exists ? saved.data : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-blue-600 px-4 py-1 text-lg font-black text-white">第{q.position}問</span>
        <span className={`text-4xl font-black tabular-nums ${remaining <= 5000 ? 'text-red-600' : 'text-blue-700'}`}>
          {remaining >= 60000 ? clock(Math.ceil(remaining / 1000)) : `${Math.max(0, Math.ceil(remaining / 1000))}秒`}
        </span>
      </div>
      <p className="text-xl leading-relaxed font-bold whitespace-pre-wrap">{q.prompt}</p>
      {q.imageUrl && <img src={q.imageUrl} alt={q.imageAlt ?? ''} className="max-h-60 w-full rounded-xl object-contain" />}
      {q.type === 'multiple_choice' ? (
        <div className="grid gap-3">
          {q.choices.map((c, i) => {
            const mine = serverAnswer?.choiceId === c.id
            return (
              <button
                key={c.id}
                disabled={timeUp}
                onClick={() => send_({ choiceId: c.id })}
                className={`flex items-center gap-3 rounded-2xl px-5 py-4 text-left text-xl font-bold ring-2 transition disabled:opacity-50 ${
                  mine ? 'bg-blue-600 text-white ring-blue-700' : 'bg-white ring-blue-200 active:bg-blue-50'
                }`}
              >
                <span className={mine ? 'text-white' : 'text-blue-600'}>{CHOICE_MARKS[i]}</span>
                {c.label}
              </button>
            )
          })}
        </div>
      ) : q.type === 'text_input' ? (
        <TextInput key={q.id} saved={serverAnswer?.text} disabled={timeUp} onSubmit={(text) => send_({ text })} />
      ) : (
        <OrderingInput
          choices={q.choices}
          savedOrder={serverAnswer?.orderIds}
          disabled={timeUp}
          onSubmit={(orderIds) => send_({ orderIds })}
        />
      )}
      <SendStatus send={send} hasSaved={!!serverAnswer} pendingServer={saved.exists && !saved.fromServer} timeUp={timeUp} />
    </div>
  )
}

function SendStatus({ send, hasSaved, pendingServer, timeUp }: { send: SendState; hasSaved: boolean; pendingServer: boolean; timeUp: boolean }) {
  if (send === 'sending' || pendingServer) return <Notice tone="warn">送信中…(まだ保存されていません)</Notice>
  if (send === 'late') return <Notice tone="error">締切に間に合わず、今の変更は保存されませんでした。</Notice>
  if (send === 'error')
    return <Notice tone="error">保存できませんでした。電波を確認して、もう一度選んでください。</Notice>
  if (hasSaved)
    return <Notice tone="ok">✓ 回答を保存しました。{timeUp ? '' : '締切までは何度でも変更できます。'}</Notice>
  return <Notice>{timeUp ? '締切です。' : 'まだ回答していません。'}</Notice>
}

function OrderingInput({
  choices,
  savedOrder,
  disabled,
  onSubmit,
}: {
  choices: { id: string; label: string }[]
  savedOrder?: string[]
  disabled: boolean
  onSubmit: (ids: string[]) => void
}) {
  const [order, setOrder] = useState<string[]>(() => savedOrder ?? choices.map((c) => c.id))
  const [picked, setPicked] = useState<number | null>(null)
  const label = (id: string) => choices.find((c) => c.id === id)?.label
  const same = savedOrder && savedOrder.join() === order.join()
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= order.length) return
    const o = [...order]
    ;[o[i], o[j]] = [o[j], o[i]]
    setOrder(o)
    setPicked(null)
  }
  // タップで2つ選ぶと入れ替わる(上へ・下へボタンも使える)
  const tap = (i: number) => {
    if (picked === null) return setPicked(i)
    if (picked === i) return setPicked(null)
    const o = [...order]
    ;[o[i], o[picked]] = [o[picked], o[i]]
    setOrder(o)
    setPicked(null)
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">項目をタップして2つ選ぶと入れ替わります。▲▼でも動かせます。</p>
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li
            key={id}
            className={`flex items-center gap-2 rounded-2xl bg-white p-2 ring-2 ${picked === i ? 'ring-amber-400 bg-amber-50' : 'ring-blue-200'}`}
          >
            <span className="w-8 text-center text-xl font-black text-blue-600">{i + 1}</span>
            <button disabled={disabled} onClick={() => tap(i)} className="flex-1 py-2 text-left text-lg font-bold">
              {label(id)}
            </button>
            <button disabled={disabled || i === 0} onClick={() => move(i, -1)} className="h-12 w-12 rounded-xl bg-blue-50 text-xl disabled:opacity-30" aria-label="上へ">▲</button>
            <button disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} className="h-12 w-12 rounded-xl bg-blue-50 text-xl disabled:opacity-30" aria-label="下へ">▼</button>
          </li>
        ))}
      </ol>
      <Button big className="w-full" disabled={disabled} onClick={() => onSubmit(order)}>
        {same ? 'この順番で回答済み' : savedOrder ? 'この順番に変更して回答' : 'この順番で回答'}
      </Button>
    </div>
  )
}

function TextInput({ saved, disabled, onSubmit }: { saved?: string; disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState(saved ?? '')
  // 再読み込み直後など、保存済みの答えが後から届いたら入力欄に入れる
  useEffect(() => { if (saved !== undefined) setText((cur) => cur || saved) }, [saved])
  const t = text.trim()
  const same = saved !== undefined && saved === t
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (t) onSubmit(t) }}>
      <input
        className="w-full rounded-2xl border-2 border-blue-200 bg-white px-4 py-4 text-2xl font-bold"
        value={text}
        maxLength={MAX_TEXT_ANSWER}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        placeholder="答えを入力"
        aria-label="答え"
        autoComplete="off"
      />
      <p className="text-sm text-slate-600">ひらがな・カタカナ・全角半角の違いは気にしなくて大丈夫です。締切までは何度でも送り直せます。</p>
      <Button big className="w-full" disabled={disabled || !t || same}>
        {same ? 'この答えで回答済み' : saved ? 'この答えに変更する' : 'この答えで回答'}
      </Button>
    </form>
  )
}

function AnswerText({ day, answer }: { day: DayState; answer: AnswerDoc | null }) {
  const q = day.currentQuestion!
  if (!answer) return <p className="text-xl font-bold text-slate-500">未回答</p>
  const label = (id: string) => q.choices.find((c) => c.id === id)?.label ?? '?'
  if (q.type === 'text_input') return <p className="text-2xl font-black break-all">{answer.text}</p>
  if (q.type === 'multiple_choice') return <p className="text-2xl font-black">{label(answer.choiceId!)}</p>
  return (
    <ol className="list-decimal space-y-1 pl-6 text-left text-xl font-bold">
      {answer.orderIds?.map((id) => <li key={id}>{label(id)}</li>)}
    </ol>
  )
}

function ClosedPanel({ dayId, uid, day }: { dayId: string; uid: string; day: DayState }) {
  const q = day.currentQuestion!
  const saved = useMyAnswer(dayId, uid, q.id)
  // サーバーで確定した回答だけを表示する(送信中のものは「保存済み」と出さない)
  const confirmed = saved.fromServer && saved.exists ? saved.data : null
  return (
    <Card className="space-y-4 py-8 text-center">
      <p className="text-3xl font-black text-blue-700">回答締切</p>
      <p className="text-slate-600">第{q.position}問 あなたのチームの回答</p>
      {saved.loading || (!saved.fromServer && saved.exists) ? <p>確認中…</p> : <AnswerText day={day} answer={confirmed} />}
      <p className="text-lg">正解発表をお待ちください。</p>
    </Card>
  )
}

function RevealPanel({ dayId, uid, day, showExplanation }: { dayId: string; uid: string; day: DayState; showExplanation: boolean }) {
  const q = day.currentQuestion!
  const mark = useDocData<MarkDoc>(p.mark(db, E, dayId, answerDocId(uid, q.id)), `mark-${q.id}`)
  const reveal = useDocData<RevealDoc>(showExplanation ? p.reveal(db, E, dayId, q.id) : null, `rev-${q.id}-${showExplanation}`)
  const label = (id: string) => q.choices.find((c) => c.id === id)?.label ?? '?'
  if (mark.loading) return <p className="py-20 text-center">読み込み中…</p>
  const m = mark.data
  return (
    <Card className="space-y-4 py-8 text-center">
      <p className="text-slate-600">第{q.position}問</p>
      {m?.isCorrect ? (
        <p className="text-6xl font-black text-emerald-600">正解!</p>
      ) : m?.answered ? (
        <p className="text-5xl font-black text-slate-500">不正解…</p>
      ) : (
        <p className="text-4xl font-black text-slate-500">未回答</p>
      )}
      {showExplanation && reveal.data && (
        <div className="space-y-2 rounded-2xl bg-blue-50 p-4 text-left">
          <p className="text-sm font-bold text-blue-700">正解</p>
          {reveal.data.acceptedAnswers ? (
            <p className="text-xl font-black">{reveal.data.acceptedAnswers.join(' / ')}</p>
          ) : reveal.data.correctChoiceId ? (
            <p className="text-xl font-black">{label(reveal.data.correctChoiceId)}</p>
          ) : (
            <ol className="list-decimal pl-6 text-lg font-bold">
              {reveal.data.correctOrderIds?.map((id) => <li key={id}>{label(id)}</li>)}
            </ol>
          )}
          {reveal.data.explanation && <p className="text-base text-slate-700">{reveal.data.explanation}</p>}
        </div>
      )}
      <p className="text-slate-600">次の問題をお待ちください。</p>
    </Card>
  )
}

function RankPanel({ dayId, uid, title, finished }: { dayId: string; uid: string; title: string; finished?: boolean }) {
  const r = useDocData<TeamResultDoc>(p.result(db, E, dayId, uid), `res-${dayId}-${uid}`)
  // 順位は「次へ」の直後に書き込まれる。リアルタイム購読なので書き込まれ次第表示が変わる
  const body = useMemo(() => {
    if (!r.data) return <p>集計中…</p>
    return (
      <>
        <p className="text-6xl font-black text-blue-700">{r.data.rank ?? '–'}位</p>
        <p className="text-2xl font-bold">{r.data.score}問正解</p>
      </>
    )
  }, [r.data])
  return (
    <Card className="space-y-4 py-10 text-center">
      <p className="text-xl font-bold text-slate-600">{title}</p>
      {body}
      <p className="text-slate-600">{finished ? 'おつかれさまでした!' : '次の問題をお待ちください。'}</p>
    </Card>
  )
}
