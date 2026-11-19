import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const env = import.meta.env

export const useEmulator = env.VITE_USE_EMULATOR === 'true'

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-quiz',
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
export const db = getFirestore(app)

if (useEmulator) {
  const host = env.VITE_EMULATOR_HOST || location.hostname
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
}
