import { CHOICE_MARKS } from '../lib/marks'
import type { DayState, RevealDoc } from '../lib/types'

type Q = NonNullable<DayState['currentQuestion']>

/** 会場(プロジェクター)用の問題表示。reveal を渡したときだけ正解を強調する */
export function QuestionView({ q, reveal }: { q: Q; reveal?: RevealDoc | null }) {
  // 問題文や画像に A〜D が出てくる問題があるので、選択肢の記号は丸数字にする
  const mark = CHOICE_MARKS
  const correctOrder = reveal?.correctOrderIds
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="rounded-full bg-blue-600 px-5 py-2 text-2xl font-black text-white">第{q.position}問</span>
        <span className="rounded-full bg-blue-100 px-4 py-2 text-xl font-bold text-blue-800">
          {q.type === 'ordering' ? '並べ替え 30秒' : '4択 20秒'}
        </span>
      </div>
      <h2 className="text-4xl leading-snug font-black whitespace-pre-wrap text-slate-900">{q.prompt}</h2>
      {q.imageUrl && (
        <img src={q.imageUrl} alt={q.imageAlt ?? ''} className="mx-auto max-h-[40vh] rounded-2xl object-contain" />
      )}
      {q.type === 'multiple_choice' ? (
        <div className="grid grid-cols-2 gap-4">
          {q.choices.map((c, i) => {
            const isCorrect = reveal?.correctChoiceId === c.id
            const dim = reveal && !isCorrect
            return (
              <div
                key={c.id}
                className={`flex items-center gap-4 rounded-2xl p-5 text-3xl font-bold ring-2 ${
                  isCorrect ? 'bg-emerald-500 text-white ring-emerald-600' : 'bg-white ring-blue-200'
                } ${dim ? 'opacity-40' : ''}`}
              >
                <span className="text-blue-600">{isCorrect ? '◎' : mark[i]}</span>
                {c.label}
              </div>
            )
          })}
        </div>
      ) : correctOrder ? (
        <ol className="space-y-3">
          {correctOrder.map((id, i) => (
            <li key={id} className="flex items-center gap-4 rounded-2xl bg-emerald-500 p-4 text-3xl font-bold text-white">
              <span>{i + 1}</span>
              {q.choices.find((c) => c.id === id)?.label}
            </li>
          ))}
        </ol>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {q.choices.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white p-5 text-3xl font-bold ring-2 ring-blue-200">
              {c.label}
            </div>
          ))}
        </div>
      )}
      {reveal?.explanation && (
        <p className="rounded-2xl bg-blue-50 p-5 text-2xl text-slate-800">{reveal.explanation}</p>
      )}
    </div>
  )
}

export function Countdown({ remainingMs, totalSec }: { remainingMs: number; totalSec: number }) {
  const sec = Math.max(0, Math.ceil(remainingMs / 1000))
  const ratio = Math.max(0, Math.min(1, remainingMs / (totalSec * 1000)))
  const danger = sec <= 5
  return (
    <div className="space-y-2">
      <div className={`text-center text-7xl font-black tabular-nums ${danger ? 'text-red-600' : 'text-blue-700'}`}>
        {sec}
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-blue-100">
        <div
          className={`h-full ${danger ? 'bg-red-500' : 'bg-blue-600'} transition-[width] duration-200`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}

export function RankingList({ entries, title }: { entries: { rank: number; displayName: string; score: number }[]; title: string }) {
  return (
    <div className="space-y-6">
      <h2 className="text-center text-5xl font-black text-blue-700">{title}</h2>
      <ol className="mx-auto max-w-3xl space-y-4">
        {entries.map((e, i) => (
          <li
            key={i}
            className={`flex items-center justify-between rounded-3xl px-8 py-5 text-4xl font-black ${
              e.rank === 1 ? 'bg-amber-300' : e.rank === 2 ? 'bg-slate-200' : 'bg-orange-200'
            }`}
          >
            <span>{e.rank}位</span>
            <span className="flex-1 px-6 truncate">{e.displayName}</span>
            <span className="tabular-nums">{e.score}点</span>
          </li>
        ))}
        {entries.length === 0 && <li className="text-center text-2xl text-slate-500">集計中…</li>}
      </ol>
    </div>
  )
}
