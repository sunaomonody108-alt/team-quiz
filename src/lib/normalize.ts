/**
 * チーム名の重複判定用キー。
 * 全角/半角・大文字/小文字・前後と途中の空白の違いは「同じ名前」とみなす。
 * Firestore のドキュメントIDに使えない "/" は置き換える。
 */
export function teamNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\//g, '／')
    .replace(/^\.+$/, (m) => '．'.repeat(m.length))
}

export function teamNameDocId(scope: 'day' | 'event', dayId: string, nameKey: string): string {
  return `${scope === 'event' ? 'all' : dayId}__${nameKey}`
}

export function answerDocId(teamId: string, questionId: string): string {
  return `${teamId}__${questionId}`
}

/**
 * 自由記述の答え合わせ用キー。
 * 全角/半角・大文字/小文字・カタカナ/ひらがな・空白・句読点や記号の違いは同じとみなす。
 * 漢字とかなの違い(林檎/りんご)は同じにならないので、正解の書き方を複数登録する。
 */
export function answerKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s、。,.・!?！？「」『』()（）"'`~〜:]/g, '')
}
