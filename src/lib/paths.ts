import { collection, doc, type Firestore } from 'firebase/firestore'

export const p = {
  event: (db: Firestore, e: string) => doc(db, 'events', e),
  qPub: (db: Firestore, e: string, q: string) => doc(db, 'events', e, 'questionsPublic', q),
  qPubCol: (db: Firestore, e: string) => collection(db, 'events', e, 'questionsPublic'),
  qPriv: (db: Firestore, e: string, q: string) => doc(db, 'events', e, 'questionsPrivate', q),
  qPrivCol: (db: Firestore, e: string) => collection(db, 'events', e, 'questionsPrivate'),
  teamName: (db: Firestore, e: string, key: string) => doc(db, 'events', e, 'teamNames', key),
  day: (db: Firestore, e: string, d: string) => doc(db, 'events', e, 'days', d),
  team: (db: Firestore, e: string, d: string, t: string) => doc(db, 'events', e, 'days', d, 'teams', t),
  teamCol: (db: Firestore, e: string, d: string) => collection(db, 'events', e, 'days', d, 'teams'),
  teamPrivate: (db: Firestore, e: string, d: string, t: string) =>
    doc(db, 'events', e, 'days', d, 'teamPrivate', t),
  teamPrivateCol: (db: Firestore, e: string, d: string) => collection(db, 'events', e, 'days', d, 'teamPrivate'),
  answer: (db: Firestore, e: string, d: string, id: string) => doc(db, 'events', e, 'days', d, 'answers', id),
  answerCol: (db: Firestore, e: string, d: string) => collection(db, 'events', e, 'days', d, 'answers'),
  mark: (db: Firestore, e: string, d: string, id: string) => doc(db, 'events', e, 'days', d, 'marks', id),
  markCol: (db: Firestore, e: string, d: string) => collection(db, 'events', e, 'days', d, 'marks'),
  result: (db: Firestore, e: string, d: string, t: string) => doc(db, 'events', e, 'days', d, 'teamResults', t),
  resultCol: (db: Firestore, e: string, d: string) => collection(db, 'events', e, 'days', d, 'teamResults'),
  reveal: (db: Firestore, e: string, d: string, q: string) => doc(db, 'events', e, 'days', d, 'reveals', q),
  ranking: (db: Firestore, e: string, d: string, r: string) =>
    doc(db, 'events', e, 'days', d, 'publicRankings', r),
  clock: (db: Firestore, uid: string) => doc(db, 'clockSync', uid),
  admin: (db: Firestore, uid: string) => doc(db, 'admins', uid),
}
