import { formatSec, TYPE_LABEL } from '../lib/config'
import type { InterimMode } from '../lib/types'
import { signOut } from 'firebase/auth'
import { getDocs } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdminGate } from '../components/AdminGate'
import { Button, Card, Notice } from '../components/ui'
import { importQuestions, initEvent, resetDay, setQuestionsLocked, updateSettings } from '../lib/admin'
import { DAY_IDS, EVENT_ID } from '../lib/config'
import { auth, db } from '../lib/firebase'
import { useDocData } from '../lib/hooks'
import { p } from '../lib/paths'
import { mergeForExport } from '../lib/questions'
import type { DayState, EventDoc, PrivateQuestion, PublicQuestion, TeamResultDoc } from '../lib/types'
import { MOCK_QUESTIONS } from '../mock/questions'
import { joinUrl } from './Host'

const E = EVENT_ID

export default function Admin() {
  return <AdminGate title="管理画面ログイン">{() => <AdminScreen />}</AdminGate>
}

function AdminScreen() {
  const ev = useDocData<EventDoc>(p.event(db, E), 'aev')
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between rounded-2xl bg-red-600 px-5 py-3 text-white">
          <p className="font-bold">管理画面:正解と氏名が表示されます。プロジェクターに映さないでください。</p>
          <Button variant="ghost" className="!text-white" onClick={() => signOut(auth)}>ログアウト</Button>
        </div>
        {ev.loading ? <p>読み込み中…</p> : !ev.exists ? <InitEvent /> : (
          <>
            <Days />
            <Settings ev={ev.data!} />
            <Questions locked={!!ev.data!.questionsLocked} />
          </>
        )}
      </div>
    </div>
  )
}

function useAction() {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fn()
      setMsg({ tone: 'ok', text: r || '完了しました' })
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const view = msg && <Notice tone={msg.tone}>{msg.text}</Notice>
  return { run, busy, view }
}

function InitEvent() {
  const [name, setName] = useState('職場レク チーム対抗クイズ')
  const a = useAction()
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-black">イベントを初期化</h2>
      <p>まだイベントがありません。イベント名を決めて作成してください(1日目・2日目の進行データも作られます)。</p>
      <input className="w-full rounded-xl border-2 px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
      <Button disabled={a.busy || !name} onClick={() => a.run(() => initEvent(db, E, name))}>作成</Button>
      {a.view}
    </Card>
  )
}

function Days() {
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-black">開催日</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {DAY_IDS.map((d) => <DayCard key={d} dayId={d} />)}
      </div>
    </Card>
  )
}

const phaseLabel: Record<DayState['phase'], string> = {
  setup: '未開始', registration: '受付中', waiting: '問題待機', open: '出題中',
  closed: '締切', revealed: '正解発表', interim: '途中順位', finished: '終了',
}

/** 変換で「消す」「ケス」になっても受け付ける */
const RESET_WORDS = ['けす', '消す', 'ケス']

function DayCard({ dayId }: { dayId: string }) {
  const day = useDocData<DayState>(p.day(db, E, dayId), `aday-${dayId}`)
  const [resetWord, setResetWord] = useState('')
  const [teams, setTeams] = useState<{ id: string; name: string; members: string[]; score: number | null; rank: number | null }[] | null>(null)
  const a = useAction()
  async function loadTeams() {
    const [t, priv, res] = await Promise.all([
      getDocs(p.teamCol(db, E, dayId)),
      getDocs(p.teamPrivateCol(db, E, dayId)),
      getDocs(p.resultCol(db, E, dayId)),
    ])
    const pm = new Map(priv.docs.map((d) => [d.id, d.data().memberNames as string[]]))
    const rm = new Map(res.docs.map((d) => [d.id, d.data() as TeamResultDoc]))
    setTeams(
      t.docs
        .map((d) => ({
          id: d.id,
          name: d.data().displayName as string,
          members: pm.get(d.id) ?? [],
          score: rm.get(d.id)?.score ?? null,
          rank: rm.get(d.id)?.rank ?? null,
        }))
        .sort((x, y) => (y.score ?? 0) - (x.score ?? 0)),
    )
  }
  if (!day.data) return <div>読み込み中…</div>
  const d = day.data
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black">{d.dayNumber}日目</h3>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-800">
          {phaseLabel[d.phase]}{d.questionPosition ? ` / 第${d.questionPosition}問` : ''}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/host/${dayId}`} target="_blank" className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">司会者画面を開く</Link>
        <Button variant="secondary" onClick={() => a.run(async () => { await loadTeams() })}>チーム一覧を表示</Button>
      </div>
      <p className="break-all text-xs text-slate-500">参加URL:{joinUrl(dayId)}</p>
      {teams && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500"><th>順位</th><th>チーム</th><th>メンバー</th><th>点</th></tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-t">
                <td>{t.rank ?? '–'}</td><td className="font-bold">{t.name}</td>
                <td>{t.members.join('、')}</td><td>{t.score ?? '–'}</td>
              </tr>
            ))}
            {teams.length === 0 && <tr><td colSpan={4} className="py-2 text-slate-500">まだ登録がありません</td></tr>}
          </tbody>
        </table>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-500">リハーサル用:この日のデータをすべて消す</summary>
        <div className="mt-2 space-y-2">
          <p className="text-red-700">登録チーム・回答・得点・順位がすべて消え、元に戻せません。本番中は使わないでください。</p>
          {/* prompt() はスマホのアプリ内ブラウザ等で表示されないことがあるため、画面内の入力欄で確認する */}
          <label className="block">
            確認のため「けす」と入力:
            <input className="ml-2 w-28 rounded-lg border-2 px-2 py-1" value={resetWord} onChange={(e) => setResetWord(e.target.value)}
              aria-label={`${d.dayNumber}日目リセットの確認`} />
          </label>
          <Button variant="danger" disabled={a.busy || !RESET_WORDS.includes(resetWord.trim())} onClick={() =>
            a.run(async () => { await resetDay(db, E, dayId); setTeams(null); setResetWord(''); return `${d.dayNumber}日目をリセットしました` })
          }>この日をリセット</Button>
        </div>
      </details>
      {a.view}
    </div>
  )
}

function Settings({ ev }: { ev: EventDoc }) {
  const s = ev.settings
  const a = useAction()
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-black">表示設定(仮仕様・あとで変更可)</h2>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={s.showExplanationOnPhone}
          onChange={(e) => a.run(() => updateSettings(db, E, { showExplanationOnPhone: e.target.checked }))} />
        正解発表後、スマホにも「正解と解説」を出す(オフ=正誤だけ)
      </label>
      <label className="flex items-center gap-3">
        チーム名の重複チェック:
        <select className="rounded-lg border px-2 py-1" value={s.teamNameScope}
          onChange={(e) => a.run(() => updateSettings(db, E, { teamNameScope: e.target.value as 'day' | 'event' }))}>
          <option value="day">同じ日の中だけ</option>
          <option value="event">2日間通して</option>
        </select>
      </label>
      <label className="flex items-center gap-3">
        途中順位:
        <select className="rounded-lg border px-2 py-1" value={s.interimMode ?? 'half'}
          onChange={(e) => a.run(() => updateSettings(db, E, { interimMode: e.target.value as InterimMode }))}>
          <option value="half">真ん中で1回(6問なら3問目の後)</option>
          <option value="every5">5問ごと(20問向け)</option>
          <option value="none">出さない</option>
        </select>
      </label>
      <p className="text-sm text-slate-500">重複チェックの範囲は、1日目の受付を始める前に決めてください(途中で変えると判定がずれます)。</p>
      {a.view}
    </Card>
  )
}

function Questions({ locked }: { locked: boolean }) {
  const [list, setList] = useState<{ pub: PublicQuestion; priv?: PrivateQuestion }[] | null>(null)
  const [json, setJson] = useState('')
  const a = useAction()
  async function load() {
    const [pub, priv] = await Promise.all([getDocs(p.qPubCol(db, E)), getDocs(p.qPrivCol(db, E))])
    const pm = new Map(priv.docs.map((d) => [d.id, d.data() as PrivateQuestion]))
    setList(pub.docs.map((d) => ({ pub: d.data() as PublicQuestion, priv: pm.get(d.id) })).sort((x, y) => x.pub.position - y.pub.position))
  }
  useEffect(() => { load().catch(() => {}) }, [])
  const label = (q: PublicQuestion, id?: string) => q.choices.find((c) => c.id === id)?.label ?? '?'
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">問題({list?.length ?? '–'}問)</h2>
        {locked ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">ロック中(1日目開始済み)</span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">編集できます</span>
        )}
      </div>
      {locked && (
        <Notice tone="warn">
          2日間で同じ問題を使うため、1日目の開始時に問題をロックしました。どうしても直す場合だけ解除してください(両日の採点に影響します)。
          <div className="mt-2">
            <Button variant="danger" onClick={() => {
              if (confirm('問題のロックを解除します。開催中の修正は採点に影響します。本当に解除しますか?'))
                a.run(() => setQuestionsLocked(db, E, false))
            }}>ロックを解除</Button>
          </div>
        </Notice>
      )}
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          問題はJSON(下の形式)で一括登録します。問題数は3〜20問。制限時間は durationSec(秒)で問題ごとに指定でき、省略すると4択20秒・並べ替え30秒・自由記述3分です。形式は README を参照。
        </p>
        <label className="block text-sm">
          <span className="font-bold">JSONファイルを選ぶ:</span>{' '}
          <input type="file" accept=".json,application/json" disabled={locked} onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setJson(await f.text())
            e.target.value = ''
          }} />
          <span className="block text-slate-500">選ぶと下の欄に中身が入ります。確認してから「登録」を押してください。</span>
        </label>
        <textarea className="h-40 w-full rounded-xl border-2 p-2 font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)}
          placeholder='[{"position":1,"type":"multiple_choice","prompt":"…","choices":[{"id":"a","label":"…"},…],"correctChoiceId":"a","explanation":"…"}, …]' />
        <div className="flex flex-wrap gap-2">
          <Button disabled={a.busy || locked || !json.trim()} onClick={() => a.run(async () => {
            let data: unknown
            try { data = JSON.parse(json) } catch { throw new Error('JSONの形式が正しくありません(カンマや括弧を確認)') }
            const n = await importQuestions(db, E, data)
            await load()
            return `${n}問を登録しました`
          })}>貼り付けた問題を登録</Button>
          <Button variant="secondary" disabled={a.busy || locked} onClick={() => a.run(async () => {
            if (list?.length && !confirm('今の問題をモック問題で上書きします。よろしいですか?')) return '取り消しました'
            await importQuestions(db, E, MOCK_QUESTIONS)
            await load()
            return 'モック20問を登録しました'
          })}>モック20問を登録(動作確認用)</Button>
          <Button variant="secondary" disabled={!list?.length} onClick={() => {
            setJson(JSON.stringify(list!.map((q) => mergeForExport(q.pub, q.priv ?? { explanation: '' })), null, 2))
          }}>今の問題を下の欄に書き出す</Button>
        </div>
        {a.view}
      </div>
      {list && (
        <ol className="space-y-2">
          {list.map(({ pub, priv }) => (
            <li key={pub.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-bold">
                Q{pub.position} [{TYPE_LABEL[pub.type]} {formatSec(pub.durationSec)}] {pub.prompt}
              </p>
              {pub.imageUrl && <img src={pub.imageUrl} alt={pub.imageAlt ?? ''} className="my-1 h-24 rounded border bg-white object-contain" />}
              <p className="text-slate-600">
                正解:{pub.type === 'text_input' ? (priv?.acceptedAnswers ?? []).join(' / ') : pub.type === 'multiple_choice' ? label(pub, priv?.correctChoiceId) : priv?.correctOrderIds?.map((id) => label(pub, id)).join(' → ')}
                {priv?.explanation ? ` / 解説:${priv.explanation}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
