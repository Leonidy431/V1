'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { parseSeed } = require('./houses');

admin.initializeApp();
const db = admin.firestore();

function randomSeed() {
  let seed = '';
  for (let i = 0; i < 12; i++) {
    seed += crypto.randomInt(0, 10).toString();
  }
  return seed;
}

/** Генерирует новый 12-значный seed и его разбор по Домам/Темам. */
exports.generateSeed = functions.https.onCall(() => {
  const seed = randomSeed();
  return { seed, houses: parseSeed(seed) };
});

/** Разбирает присланный seed по Домам/Темам без сохранения. */
exports.parseSeed = functions.https.onCall((data) => {
  const seed = data && data.seed;
  if (typeof seed !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Поле seed (строка из 12 цифр) обязательно');
  }
  try {
    return { seed, houses: parseSeed(seed) };
  } catch (err) {
    throw new functions.https.HttpsError('invalid-argument', err.message);
  }
});

/** Сохраняет сгенерированную картину (seed + разбор) в галерею пользователя. */
exports.savePainting = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Требуется авторизация (в т.ч. анонимная)');
  }
  const seed = data && data.seed;
  if (typeof seed !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Поле seed (строка из 12 цифр) обязательно');
  }

  let houses;
  try {
    houses = parseSeed(seed);
  } catch (err) {
    throw new functions.https.HttpsError('invalid-argument', err.message);
  }

  const doc = {
    uid: context.auth.uid,
    seed,
    houses,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  const ref = await db.collection('paintings').add(doc);
  return { id: ref.id };
});

/** Возвращает последние картины текущего пользователя. */
exports.listPaintings = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Требуется авторизация (в т.ч. анонимная)');
  }
  const snapshot = await db.collection('paintings')
    .where('uid', '==', context.auth.uid)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  return { paintings: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
});
