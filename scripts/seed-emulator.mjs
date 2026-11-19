// Emulator 専用:テスト用の管理者アカウント(admin@example.com / password)を作る。
// 本物の Firebase には接続しない(demo- で始まるプロジェクトIDは Emulator 専用)。
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
const { initializeApp } = await import('firebase-admin/app')
const { getAuth } = await import('firebase-admin/auth')
const { getFirestore } = await import('firebase-admin/firestore')

const app = initializeApp({ projectId: 'demo-quiz' })
const auth = getAuth(app)
let user
try {
  user = await auth.getUserByEmail('admin@example.com')
} catch {
  user = await auth.createUser({ email: 'admin@example.com', password: 'password' })
}
await getFirestore(app).doc(`admins/${user.uid}`).set({ email: 'admin@example.com' })
console.log(`管理者を用意しました: admin@example.com / password (uid=${user.uid})`)
process.exit(0)
