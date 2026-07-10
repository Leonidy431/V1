/**
 * Необязательный клиент Firebase-бекенда.
 * Активируется только если web/js/firebase-config.js определяет window.__FIREBASE_CONFIG__
 * (скопируйте firebase-config.example.js и заполните свой проект).
 * Без конфигурации приложение работает в локальном режиме (генерация/разбор seed на клиенте).
 */
(function (global) {
  'use strict';

  const SDK_VERSION = '10.12.2';

  class FirebaseClient {
    constructor() {
      this.ready = false;
      this.app = null;
      this.auth = null;
      this.functions = null;
    }

    get isConfigured() {
      return Boolean(global.__FIREBASE_CONFIG__);
    }

    async init() {
      if (!this.isConfigured || this.ready) return this.ready;
      try {
        const [{ initializeApp }, { getAuth, signInAnonymously }, { getFunctions, httpsCallable }] = await Promise.all([
          import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
          import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
          import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-functions.js`)
        ]);

        this.app = initializeApp(global.__FIREBASE_CONFIG__);
        this.auth = getAuth(this.app);
        await signInAnonymously(this.auth);
        this.functions = getFunctions(this.app);
        this._httpsCallable = httpsCallable;
        this.ready = true;
      } catch (err) {
        console.warn('Firebase недоступен, работаем локально:', err);
        this.ready = false;
      }
      return this.ready;
    }

    async generateSeed() {
      if (!this.ready) return null;
      const call = this._httpsCallable(this.functions, 'generateSeed');
      const res = await call();
      return res.data.seed;
    }

    async savePainting(seed) {
      if (!this.ready) throw new Error('Firebase не подключен');
      const call = this._httpsCallable(this.functions, 'savePainting');
      const res = await call({ seed });
      return res.data.id;
    }

    async listPaintings() {
      if (!this.ready) return [];
      const call = this._httpsCallable(this.functions, 'listPaintings');
      const res = await call();
      return res.data.paintings;
    }
  }

  global.firebaseClient = new FirebaseClient();
})(typeof window !== 'undefined' ? window : globalThis);
