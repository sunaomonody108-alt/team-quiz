// E2E(手動実行用): Emulator + vite dev を起動した状態で `node e2e/run-e2e.mjs`
// 司会者PC1台 + スマホ3台を Playwright で動かし、Q1〜Q5(途中順位)まで通す。
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173/'
const SHOTS = process.env.SHOTS ?? 'e2e-shots'
const browser = await chromium.launch()
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const shot = async (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` })

const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const host = await hostCtx.newPage()
host.on('pageerror', (e) => log('HOST ERROR', e.message))
host.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'けす' : undefined))

// 管理画面:ログイン → イベント初期化 → モック問題
await host.goto(BASE + '#/admin')
await host.getByRole('button', { name: 'ログイン' }).click()
await host.getByText('管理画面:正解と氏名').waitFor()
if (await host.getByRole('button', { name: '作成' }).isVisible().catch(() => false)) {
  await host.getByRole('button', { name: '作成' }).click()
  await host.getByText('1日目').first().waitFor()
}
await host.getByRole('button', { name: 'モック20問を登録(動作確認用)' }).click()
await host.getByText(/モック20問を登録しました|取り消しました/).waitFor()
await host.getByText('Q20').waitFor()
await shot(host, '00-admin')
log('admin ok')

// 司会者画面
await host.goto(BASE + '#/host/day1')
await host.getByRole('button', { name: '受付を開始' }).click()
await host.locator('svg').first().waitFor()
log('registration open')

const phones = []
for (let i = 0; i < 3; i++) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const pg = await ctx.newPage()
  pg.on('pageerror', (e) => log(`PHONE${i} ERROR`, e.message))
  await pg.goto(BASE + '#/join/day1')
  await pg.getByText('チーム登録').waitFor()
  await pg.getByLabel('チーム名(自由)').fill(`チーム${'ABC'[i]}`)
  for (let k = 0; k < 3; k++) await pg.getByLabel(`メンバー${k + 1}の名前`).fill(`山田${i}${k}`)
  await pg.getByRole('button', { name: 'この内容で登録' }).click()
  await pg.getByText('登録できました').waitFor()
  phones.push(pg)
}
// 同名チームの重複登録が拒否されるか
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] })
  const pg = await ctx.newPage()
  await pg.goto(BASE + '#/join/day1')
  await pg.getByText('チーム登録').waitFor()
  await pg.getByLabel('チーム名(自由)').fill('チームａ ')
  for (let k = 0; k < 3; k++) await pg.getByLabel(`メンバー${k + 1}の名前`).fill(`x${k}`)
  await pg.getByRole('button', { name: 'この内容で登録' }).click()
  await pg.getByText(/同じチーム名/).waitFor()
  log('duplicate name rejected')
  await ctx.close()
}
await host.getByText(/^3/).first().waitFor()
await shot(host, '01-host-registration')
await shot(phones[0], '01-phone-registered')

await host.getByRole('button', { name: '受付を締め切って開始' }).click()
// モック: Q1正解=富士山, Q2=365日, Q3=青, Q4並べ替え(1,10,100,1000), Q5=インド
const plan = [
  { a: '富士山', b: '北岳', c: null },
  { a: '365日', b: '365日', c: '364日' },
  { a: '青', b: '赤', c: '青' },
  { order: true },
  { a: 'インド', b: 'インド', c: 'カナダ' },
]
for (let qi = 0; qi < 5; qi++) {
  await host.getByRole('button', { name: '出題開始' }).click()
  await host.getByText('回答済み').waitFor()
  if (qi === 0) await host.waitForTimeout(500)
  const p = plan[qi]
  for (const [i, pg] of phones.entries()) {
    await pg.getByText(`第${qi + 1}問`).first().waitFor()
    if (p.order) {
      if (i === 2) continue
      // 初期並び 100,1,1000,10 → 正解 1,10,100,1000 にする(チームAのみ正解、Bは並び替えずに回答)
      if (i === 0) {
        // 「1」と「100」をタップで入れ替え → 1,100,1000,10 → ▼▲で 1,10,100,1000
        const items = pg.locator('ol li')
        await items.nth(0).locator('button').first().click()
        await items.nth(1).locator('button').first().click()
        await items.nth(3).getByLabel('上へ').click() // 1,100,10,1000
        await items.nth(2).getByLabel('上へ').click() // 1,10,100,1000
      }
      await pg.getByRole('button', { name: /この順番で回答/ }).click()
    } else {
      const choice = [p.a, p.b, p.c][i]
      if (!choice) continue
      if (i === 0 && qi === 0) {
        // 回答変更のテスト:一度「北岳」を選んでから「富士山」に変える
        await pg.getByRole('button', { name: /北岳/ }).click()
        await pg.getByText('回答を保存しました').waitFor()
      }
      await pg.getByRole('button', { name: new RegExp(choice) }).click()
    }
    await pg.getByText('回答を保存しました').waitFor()
  }
  if (qi === 0) {
    await host.waitForTimeout(1600)
    await shot(host, '02-host-open')
    await shot(phones[0], '02-phone-answered')
  }
  if (qi === 3) {
    await shot(phones[0], '03-phone-ordering')
  }
  log(`Q${qi + 1} answered; waiting deadline`)
  await host.getByText('回答締切').first().waitFor({ timeout: 40000 })
  await phones[0].getByText('正解発表をお待ちください').waitFor()
  if (qi === 0) {
    await shot(host, '04-host-closed')
    await shot(phones[0], '04-phone-closed')
  }
  await host.getByRole('button', { name: '正解発表' }).click()
  await host.getByText('正解発表').first().waitFor()
  await phones[0].getByText(/正解!|不正解|未回答/).first().waitFor()
  const results = await Promise.all(phones.map(async (pg) => {
    await pg.getByText(/正解!|不正解…|未回答/).first().waitFor()
    return (await pg.getByText(/正解!|不正解…|未回答/).first().textContent()).trim()
  }))
  log(`Q${qi + 1} results`, results.join(' / '))
  if (qi === 0) {
    await shot(host, '05-host-revealed')
    await shot(phones[0], '05-phone-revealed')
    await shot(phones[2], '05-phone-unanswered')
  }
  if (qi < 4) await host.getByRole('button', { name: '次の問題へ' }).click()
  else await host.getByRole('button', { name: '途中順位へ' }).click()
}
await host.getByText('第5問までの順位').waitFor()
await host.getByText('チームA').waitFor()
await shot(host, '06-host-interim')
const ranks = await Promise.all(phones.map(async (pg) => {
  await pg.getByText(/\d+位/).waitFor()
  return (await pg.locator('p', { hasText: /位$/ }).first().textContent()) + ' ' + (await pg.getByText(/問正解/).textContent())
}))
log('interim', ranks.join(' / '))
await shot(phones[1], '06-phone-interim')
// 再読み込みしても同じ状態に戻る
await phones[1].reload()
await phones[1].getByText(/問正解/).waitFor()
log('reload ok')
await browser.close()
