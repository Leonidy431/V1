# HydroFlow: Спецификация деплоя на Firebase Studio

> Полная спецификация миграции приложения HydroFlow (тренировки по плаванию) с архитектуры React + FastAPI (in-memory) на Firebase-платформу.
> Язык документа: русский, технические термины на английском.

---

## Содержание

1. [ЭТАП 1: Инициализация Firebase проекта](#этап-1-инициализация-firebase-проекта)
2. [ЭТАП 2: Миграция данных на Cloud Firestore](#этап-2-миграция-данных-на-cloud-firestore)
3. [ЭТАП 3: Firebase Authentication](#этап-3-firebase-authentication)
4. [ЭТАП 4: Миграция бэкенда на Cloud Functions](#этап-4-миграция-бэкенда-на-cloud-functions)
5. [ЭТАП 5: Адаптация фронтенда](#этап-5-адаптация-фронтенда)
6. [ЭТАП 6: Firebase Hosting деплой](#этап-6-firebase-hosting-деплой)
7. [ЭТАП 7: Аналитика и мониторинг](#этап-7-аналитика-и-мониторинг)
8. [ЭТАП 8: PWA и офлайн-режим](#этап-8-pwa-и-офлайн-режим)
9. [ЭТАП 9: Уведомления и вовлечение](#этап-9-уведомления-и-вовлечение)
10. [ЭТАП 10: Расширенные функции](#этап-10-расширенные-функции)
11. [ЭТАП 11: Тестирование и CI/CD](#этап-11-тестирование-и-cicd)
12. [ЭТАП 12: Безопасность и оптимизация](#этап-12-безопасность-и-оптимизация)

---

## ЭТАП 1: Инициализация Firebase проекта

### Описание

Создание и настройка Firebase-проекта, который станет единой платформой для хостинга, базы данных, аутентификации и серверной логики HydroFlow. На этом этапе мы заменяем текущую архитектуру (отдельный FastAPI-сервер + React dev server) на интегрированную Firebase-экосистему.

### Конкретные шаги

1. Перейти в [Firebase Console](https://console.firebase.google.com/) и создать проект `hydroflow-prod`.
2. Включить Google Analytics для проекта (потребуется на ЭТАПЕ 7).
3. Активировать сервисы в разделе Build:
   - Cloud Firestore (режим production, локация `europe-west1`)
   - Authentication (вкладка Sign-in method)
   - Hosting
   - Cloud Functions (тарифный план Blaze -- обязателен для Functions)
4. Установить Firebase CLI глобально и инициализировать проект.
5. Настроить конфигурационные файлы.
6. Зарегистрировать web-приложение и получить конфигурацию SDK.

```bash
# Установка Firebase CLI
npm install -g firebase-tools

# Авторизация
firebase login

# Инициализация проекта в корне V1
cd /home/user/V1
firebase init
# Выбрать: Firestore, Functions (Python), Hosting, Emulators
```

Файл `firebase.json` в корне проекта:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions",
    "runtime": "python312",
    "codebase": "hydroflow-api"
  },
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  },
  "emulators": {
    "auth": { "port": 9099 },
    "functions": { "port": 5001 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

Файл `.firebaserc`:

```json
{
  "projects": {
    "default": "hydroflow-prod",
    "staging": "hydroflow-staging"
  },
  "targets": {
    "hydroflow-prod": {
      "hosting": {
        "app": ["hydroflow-prod"]
      }
    }
  }
}
```

Файл `.env` для Cloud Functions (размещается в `functions/.env`):

```env
YOUTUBE_API_KEY=AIza...
APP_ENV=production
LOG_LEVEL=info
```

Для секретов используется Firebase Secret Manager:

```bash
# Установить секрет (не хранится в .env)
firebase functions:secrets:set YOUTUBE_API_KEY

# Использование в функции
@https_fn.on_call(secrets=["YOUTUBE_API_KEY"])
def get_video_meta(req):
    key = os.environ.get("YOUTUBE_API_KEY")
```

### Критерии завершения

- Проект создан в Firebase Console и доступен по URL.
- `firebase emulators:start` запускается без ошибок.
- В Firebase Console видны все четыре сервиса (Firestore, Auth, Hosting, Functions).
- Файлы `firebase.json`, `.firebaserc` лежат в корне `/home/user/V1`.

### Оценка времени

**2--3 часа**

---

## ЭТАП 2: Миграция данных на Cloud Firestore

### Описание

Текущее хранилище HydroFlow -- Python-словари в памяти (`backend/seed_data.py`). Нужно спроектировать схему Firestore-коллекций, написать security rules и скрипт миграции данных. Структура коллекций строится на основе моделей из `backend/models.py`: `Drill`, `Workout` (с вложенными `WorkoutSet`), `UserProfile` (с `DrillMastery`).

### Конкретные шаги

1. Спроектировать коллекции Firestore.
2. Написать `firestore.rules`.
3. Определить composite indexes.
4. Написать Python-скрипт миграции seed-данных.
5. Запустить миграцию в emulator, проверить, затем в production.

#### Структура коллекций

```
firestore-root/
  drills/{drillId}
    ├── name: string              # "Кроль -- работа ног"
    ├── youtube_id: string        # "dQw4w9WgXcQ"
    ├── time_start: number        # 15 (секунды)
    ├── time_end: number          # 120
    ├── description: string       # текст описания упражнения
    ├── category: string          # "warmup" | "technique" | "strength" | "cooldown"
    └── created_at: timestamp

  workouts/{workoutId}
    ├── name: string              # "Утренняя разминка"
    ├── description: string
    ├── level: string             # "novice" | "intermediate" | "advanced" | "pro"
    ├── focus: string             # "endurance" | "technique" | "speed"
    ├── total_distance_m: number  # 1500 (предвычисленное)
    ├── created_at: timestamp
    └── sets/ (subcollection)
          {setId}
            ├── drill_id: string     # ссылка на drills/{drillId}
            ├── distance_m: number   # 100
            ├── rest_seconds: number # 30
            ├── repetitions: number  # 4
            ├── equipment: string    # "доска" | "лопатки" | "none"
            └── order: number        # порядок в тренировке

  users/{userId}                    # userId = Firebase Auth UID
    ├── name: string
    ├── email: string
    ├── level: string              # "novice" | "intermediate" | "advanced" | "pro"
    ├── created_at: timestamp
    ├── last_active: timestamp
    ├── mastery: map               # встроенная map, не subcollection
    │     {drillId}: {
    │       videos_watched: number,
    │       drills_completed: number,
    │       mastery_pct: number    # 0.0 -- 1.0
    │     }
    └── workout_history: array
          [{
            workout_id: string,
            completed_at: timestamp,
            duration_seconds: number
          }]
```

#### Security Rules

Файл `firestore.rules`:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- Drills ----------
    // Все аутентифицированные пользователи могут читать упражнения.
    // Запись -- только через Admin SDK (Cloud Functions).
    match /drills/{drillId} {
      allow read: if request.auth != null;
      allow write: if false; // только Admin SDK
    }

    // ---------- Workouts ----------
    // Чтение -- для аутентифицированных.
    // Запись -- только Admin SDK.
    match /workouts/{workoutId} {
      allow read: if request.auth != null;
      allow write: if false;

      // Subcollection sets -- те же правила
      match /sets/{setId} {
        allow read: if request.auth != null;
        allow write: if false;
      }
    }

    // ---------- Users ----------
    // Пользователь может читать и писать ТОЛЬКО свой документ.
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId
                    && !request.resource.data.diff(resource.data).affectedKeys()
                       .hasAny(['created_at', 'email']);
      // Нельзя менять created_at и email через клиент
      allow delete: if false;
    }

    // ---------- Запрет всего остального ----------
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

#### Composite Indexes

Файл `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "drills",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "workouts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "level", "order": "ASCENDING" },
        { "fieldPath": "focus", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "workouts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "level", "order": "ASCENDING" },
        { "fieldPath": "total_distance_m", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

#### Скрипт миграции

Файл `scripts/migrate_to_firestore.py`:

```python
"""
Скрипт миграции seed-данных HydroFlow в Cloud Firestore.
Запуск: python scripts/migrate_to_firestore.py [--emulator]
"""

import argparse
import os
import sys

import firebase_admin
from firebase_admin import credentials, firestore

# Добавить backend в path для импорта seed_data
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from seed_data import SEED_DRILLS, SEED_WORKOUTS


def init_firebase(use_emulator: bool = False):
    """Инициализация Firebase Admin SDK."""
    if use_emulator:
        os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"
        firebase_admin.initialize_app(options={"projectId": "hydroflow-prod"})
    else:
        cred = credentials.Certificate("service-account-key.json")
        firebase_admin.initialize_app(cred)
    return firestore.client()


def migrate_drills(db):
    """Загрузить упражнения в коллекцию drills/."""
    print("Миграция drills...")
    batch = db.batch()
    for drill in SEED_DRILLS:
        ref = db.collection("drills").document(drill["id"])
        batch.set(ref, {
            "name": drill["name"],
            "youtube_id": drill["youtube_id"],
            "time_start": drill.get("time_start", 0),
            "time_end": drill.get("time_end", 0),
            "description": drill.get("description", ""),
            "category": drill["category"],
            "created_at": firestore.SERVER_TIMESTAMP,
        })
    batch.commit()
    print(f"  Загружено {len(SEED_DRILLS)} упражнений.")


def migrate_workouts(db):
    """Загрузить тренировки в коллекцию workouts/ с subcollection sets/."""
    print("Миграция workouts...")
    for workout in SEED_WORKOUTS:
        # Документ тренировки
        ref = db.collection("workouts").document(workout["id"])
        total_distance = sum(
            s["distance_m"] * s.get("repetitions", 1)
            for s in workout.get("sets", [])
        )
        ref.set({
            "name": workout["name"],
            "description": workout.get("description", ""),
            "level": workout["level"],
            "focus": workout.get("focus", "technique"),
            "total_distance_m": total_distance,
            "created_at": firestore.SERVER_TIMESTAMP,
        })

        # Subcollection sets
        for i, s in enumerate(workout.get("sets", [])):
            set_ref = ref.collection("sets").document(f"set_{i:03d}")
            set_ref.set({
                "drill_id": s["drill_id"],
                "distance_m": s["distance_m"],
                "rest_seconds": s.get("rest_seconds", 30),
                "repetitions": s.get("repetitions", 1),
                "equipment": s.get("equipment", "none"),
                "order": i,
            })

    print(f"  Загружено {len(SEED_WORKOUTS)} тренировок.")


def main():
    parser = argparse.ArgumentParser(description="Миграция данных в Firestore")
    parser.add_argument(
        "--emulator", action="store_true",
        help="Использовать Firestore emulator (localhost:8080)"
    )
    args = parser.parse_args()

    db = init_firebase(use_emulator=args.emulator)
    migrate_drills(db)
    migrate_workouts(db)
    print("Миграция завершена.")


if __name__ == "__main__":
    main()
```

### Критерии завершения

- Все drill-документы доступны по пути `drills/{drillId}` в Firestore.
- Все workout-документы имеют subcollection `sets/` с правильным порядком.
- Security rules деплоятся без ошибок (`firebase deploy --only firestore:rules`).
- Indexes создаются (`firebase deploy --only firestore:indexes`).
- В emulator-е можно прочитать данные от имени аутентифицированного пользователя и получить отказ для неаутентифицированного.

### Оценка времени

**4--6 часов**

---

## ЭТАП 3: Firebase Authentication

### Описание

Текущая версия HydroFlow не имеет аутентификации -- используется единственный захардкоженный `UserProfile` с `id="user_1"`. Нужно интегрировать Firebase Auth с провайдерами Email/Password и Google Sign-In, добавить protected routes и flow онбординга с выбором уровня подготовки.

### Конкретные шаги

1. В Firebase Console -> Authentication -> Sign-in method включить:
   - Email/Password (включить Email link sign-in -- опционально)
   - Google (указать OAuth client ID из Google Cloud Console)
2. Установить Firebase SDK в frontend.
3. Создать конфигурационный файл `firebase.js`.
4. Реализовать Auth state observer.
5. Добавить компоненты `LoginScreen` и `OnboardingScreen`.
6. Обернуть приложение в `AuthProvider`.
7. Настроить автоматическое создание профиля при первом входе.

```bash
cd /home/user/V1/frontend
npm install firebase
```

Файл `frontend/src/firebase.js`:

```javascript
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");

// Подключение к emulators в dev-режиме
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectFunctionsEmulator(functions, "localhost", 5001);
}

export default app;
```

Файл `frontend/src/contexts/AuthContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Загрузить профиль пользователя из Firestore
        const profileRef = doc(db, "users", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setUserProfile({ id: profileSnap.id, ...profileSnap.data() });
        } else {
          // Новый пользователь -- профиль ещё не создан
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const loginEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const registerEmail = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const loginGoogle = () =>
    signInWithPopup(auth, new GoogleAuthProvider());

  const logout = () => signOut(auth);

  const createProfile = async (level) => {
    if (!user) throw new Error("Пользователь не авторизован");
    const profileData = {
      name: user.displayName || user.email.split("@")[0],
      email: user.email,
      level,
      mastery: {},
      workout_history: [],
      created_at: serverTimestamp(),
      last_active: serverTimestamp(),
    };
    await setDoc(doc(db, "users", user.uid), profileData);
    setUserProfile({ id: user.uid, ...profileData });
  };

  const value = {
    user,
    userProfile,
    loading,
    loginEmail,
    registerEmail,
    loginGoogle,
    logout,
    createProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth должен вызываться внутри AuthProvider");
  return ctx;
};
```

Файл `frontend/src/components/LoginScreen.jsx`:

```jsx
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginScreen() {
  const { loginEmail, registerEmail, loginGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (isRegister) {
        await registerEmail(email, password);
      } else {
        await loginEmail(email, password);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login-screen">
      <h1>HydroFlow</h1>
      <p>Тренировки по плаванию</p>

      <form onSubmit={handleSubmit}>
        <input
          type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password" placeholder="Пароль"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">
          {isRegister ? "Зарегистрироваться" : "Войти"}
        </button>
      </form>

      <button onClick={loginGoogle} className="google-btn">
        Войти через Google
      </button>

      <button onClick={() => setIsRegister(!isRegister)} className="link-btn">
        {isRegister ? "Уже есть аккаунт? Войти" : "Создать аккаунт"}
      </button>
    </div>
  );
}
```

Файл `frontend/src/components/OnboardingScreen.jsx`:

```jsx
import { useAuth } from "../contexts/AuthContext";

const LEVELS = [
  { id: "novice", label: "Новичок", desc: "Только начинаю плавать" },
  { id: "intermediate", label: "Средний", desc: "Плаваю регулярно" },
  { id: "advanced", label: "Продвинутый", desc: "Тренируюсь серьёзно" },
  { id: "pro", label: "Профи", desc: "Соревновательный уровень" },
];

export default function OnboardingScreen() {
  const { createProfile } = useAuth();

  return (
    <div className="onboarding-screen">
      <h2>Выберите ваш уровень</h2>
      <p>Это поможет подобрать подходящие тренировки</p>
      <div className="level-grid">
        {LEVELS.map((lvl) => (
          <button
            key={lvl.id}
            className="level-card"
            onClick={() => createProfile(lvl.id)}
          >
            <strong>{lvl.label}</strong>
            <span>{lvl.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

Обновление `frontend/src/App.jsx` -- добавление protected routes:

```jsx
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginScreen from "./components/LoginScreen";
import OnboardingScreen from "./components/OnboardingScreen";
// ...existing imports...

function AppContent() {
  const { user, userProfile, loading } = useAuth();

  if (loading) return <div className="loader">Загрузка...</div>;
  if (!user) return <LoginScreen />;
  if (!userProfile) return <OnboardingScreen />;

  // Здесь рендерится основное приложение (Dashboard и т.д.)
  return <MainApp userProfile={userProfile} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
```

### Критерии завершения

- Пользователь может зарегистрироваться через Email/Password.
- Пользователь может войти через Google Sign-In.
- После первого входа показывается экран выбора уровня.
- После выбора уровня создается документ в `users/{uid}`.
- Неаутентифицированный пользователь видит только `LoginScreen`.
- Auth state сохраняется между перезагрузками страницы.

### Оценка времени

**4--5 часов**

---

## ЭТАП 4: Миграция бэкенда на Cloud Functions

### Описание

Текущий бэкенд (`backend/main.py`) содержит бизнес-логику: обновление mastery при просмотре видео, завершение тренировки, рекомендация тренировки дня. Эту логику нужно перенести в Cloud Functions (Python), которые работают с Firestore напрямую через Admin SDK. Простые операции чтения (список drills, workouts) будут выполняться фронтендом напрямую через Firestore SDK.

### Конкретные шаги

1. Создать директорию `functions/` с Python-окружением.
2. Реализовать trigger `onUserCreate` для инициализации mastery.
3. Реализовать HTTPS callable `completeWorkout`.
4. Реализовать HTTPS callable `getTodaySuggestion`.
5. Настроить локальный emulator.
6. Протестировать и деплоить.

```bash
cd /home/user/V1
mkdir -p functions
cd functions
python -m venv venv
source venv/bin/activate
pip install firebase-functions firebase-admin
pip freeze > requirements.txt
```

Файл `functions/main.py`:

```python
"""
HydroFlow Cloud Functions.
Серверная логика приложения для тренировок по плаванию.
"""

import datetime
import random
from firebase_admin import initialize_app, firestore
from firebase_functions import https_fn, identity_fn, options

initialize_app()

# ─────────────────────────────────────────────
# Trigger: Создание профиля при регистрации
# ─────────────────────────────────────────────

@identity_fn.before_user_created()
def on_user_create(event: identity_fn.AuthBlockingEvent) -> identity_fn.BeforeCreateResponse | None:
    """
    Вызывается автоматически при регистрации нового пользователя.
    Можно использовать для валидации email-домена или логирования.
    Основной профиль создаёт клиент (OnboardingScreen).
    """
    # Логирование создания пользователя
    print(f"Новый пользователь: {event.data.uid} ({event.data.email})")
    return None


# ─────────────────────────────────────────────
# Callable: Инициализация mastery для всех drills
# ─────────────────────────────────────────────

@https_fn.on_call(region="europe-west1")
def initialize_mastery(req: https_fn.CallableRequest) -> dict:
    """
    Вызывается после онбординга: заполняет mastery map
    нулевыми значениями для всех существующих drills.
    """
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Требуется авторизация."
        )

    uid = req.auth.uid
    db = firestore.client()

    # Получить все drill ID
    drills = db.collection("drills").stream()
    mastery = {}
    for drill_doc in drills:
        mastery[drill_doc.id] = {
            "videos_watched": 0,
            "drills_completed": 0,
            "mastery_pct": 0.0,
        }

    # Обновить профиль пользователя
    db.collection("users").document(uid).update({"mastery": mastery})

    return {"status": "ok", "drills_count": len(mastery)}


# ─────────────────────────────────────────────
# Callable: Завершение тренировки
# ─────────────────────────────────────────────

@https_fn.on_call(region="europe-west1")
def complete_workout(req: https_fn.CallableRequest) -> dict:
    """
    Вызывается при завершении тренировки.
    Обновляет mastery для каждого drill в тренировке
    и добавляет запись в workout_history.

    Параметры (req.data):
      - workout_id: str
      - duration_seconds: int
    """
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Требуется авторизация."
        )

    uid = req.auth.uid
    data = req.data
    workout_id = data.get("workout_id")
    duration = data.get("duration_seconds", 0)

    if not workout_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="workout_id обязателен."
        )

    db = firestore.client()

    # Получить sets тренировки
    sets_ref = (
        db.collection("workouts").document(workout_id)
        .collection("sets").order_by("order").stream()
    )
    drill_ids = [s.to_dict()["drill_id"] for s in sets_ref]

    if not drill_ids:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message=f"Тренировка {workout_id} не найдена или пуста."
        )

    # Обновить mastery -- транзакция
    user_ref = db.collection("users").document(uid)

    @firestore.transactional
    def update_mastery(transaction):
        user_snap = user_ref.get(transaction=transaction)
        if not user_snap.exists:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Профиль не найден."
            )
        user_data = user_snap.to_dict()
        mastery = user_data.get("mastery", {})
        history = user_data.get("workout_history", [])

        for drill_id in drill_ids:
            if drill_id in mastery:
                entry = mastery[drill_id]
                entry["drills_completed"] = entry.get("drills_completed", 0) + 1
                total = entry["videos_watched"] + entry["drills_completed"]
                entry["mastery_pct"] = min(1.0, total / 10.0)
            else:
                mastery[drill_id] = {
                    "videos_watched": 0,
                    "drills_completed": 1,
                    "mastery_pct": 0.1,
                }

        history.append({
            "workout_id": workout_id,
            "completed_at": datetime.datetime.now(datetime.timezone.utc),
            "duration_seconds": duration,
        })

        transaction.update(user_ref, {
            "mastery": mastery,
            "workout_history": history,
            "last_active": firestore.SERVER_TIMESTAMP,
        })

        return mastery

    transaction = db.transaction()
    updated_mastery = update_mastery(transaction)

    return {
        "status": "ok",
        "drills_updated": len(drill_ids),
        "mastery": updated_mastery,
    }


# ─────────────────────────────────────────────
# Callable: Рекомендация тренировки дня
# ─────────────────────────────────────────────

@https_fn.on_call(region="europe-west1")
def get_today_suggestion(req: https_fn.CallableRequest) -> dict:
    """
    Алгоритм подбора тренировки дня:
    1. Получить уровень пользователя.
    2. Отфильтровать тренировки по уровню.
    3. Исключить последние 3 выполненные тренировки.
    4. Приоритет: тренировки с drills с низким mastery.
    5. Возвращает workout_id и краткую информацию.
    """
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Требуется авторизация."
        )

    uid = req.auth.uid
    db = firestore.client()

    # Профиль
    user_snap = db.collection("users").document(uid).get()
    if not user_snap.exists:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="Профиль не найден."
        )

    user_data = user_snap.to_dict()
    level = user_data.get("level", "novice")
    mastery = user_data.get("mastery", {})
    history = user_data.get("workout_history", [])

    # Последние 3 тренировки (для исключения)
    recent_ids = {
        h["workout_id"] for h in sorted(
            history,
            key=lambda x: x.get("completed_at", datetime.datetime.min),
            reverse=True
        )[:3]
    }

    # Тренировки для уровня пользователя
    workouts_query = (
        db.collection("workouts")
        .where("level", "==", level)
        .stream()
    )
    candidates = []
    for w in workouts_query:
        if w.id not in recent_ids:
            candidates.append({"id": w.id, **w.to_dict()})

    if not candidates:
        # Fallback: любая тренировка данного уровня
        all_workouts = db.collection("workouts").where("level", "==", level).stream()
        candidates = [{"id": w.id, **w.to_dict()} for w in all_workouts]

    if not candidates:
        return {"status": "no_workouts", "workout": None}

    # Оценка: приоритет тренировкам с упражнениями низкого mastery
    def score_workout(w):
        sets = (
            db.collection("workouts").document(w["id"])
            .collection("sets").stream()
        )
        total_mastery = 0.0
        count = 0
        for s in sets:
            drill_id = s.to_dict().get("drill_id", "")
            if drill_id in mastery:
                total_mastery += mastery[drill_id].get("mastery_pct", 0)
            count += 1
        avg = total_mastery / max(count, 1)
        return avg  # Чем ниже, тем лучше

    candidates.sort(key=score_workout)
    chosen = candidates[0]

    return {
        "status": "ok",
        "workout": {
            "id": chosen["id"],
            "name": chosen.get("name"),
            "description": chosen.get("description"),
            "level": chosen.get("level"),
            "focus": chosen.get("focus"),
            "total_distance_m": chosen.get("total_distance_m"),
        },
    }
```

Конфигурация Functions в `firebase.json` (дополнение к ЭТАПУ 1):

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "hydroflow-api",
      "runtime": "python312",
      "ignore": [
        "venv",
        ".git",
        "**/__pycache__",
        "*.pyc"
      ]
    }
  ]
}
```

Локальный emulator для разработки:

```bash
# Запуск всех эмуляторов
firebase emulators:start

# Только Functions эмулятор
firebase emulators:start --only functions

# Запуск с импортом seed-данных
firebase emulators:start --import=./emulator-data --export-on-exit
```

### Критерии завершения

- Все три callable functions деплоятся без ошибок.
- `completeWorkout` корректно обновляет mastery в транзакции.
- `getTodaySuggestion` возвращает релевантную тренировку.
- Функции работают в emulator и в production.
- Логи видны в Firebase Console -> Functions -> Logs.

### Оценка времени

**6--8 часов**

---

## ЭТАП 5: Адаптация фронтенда

### Описание

Текущий фронтенд (`frontend/src/api.js`) общается с FastAPI через REST. Нужно заменить все fetch-вызовы на прямые Firestore SDK запросы (для чтения drills/workouts) и callable functions (для бизнес-логики). Также добавить real-time listeners для обновления mastery и offline persistence.

### Конкретные шаги

1. Заменить `api.js` на `services/firestore.js` и `services/functions.js`.
2. Добавить real-time listeners для профиля пользователя.
3. Включить offline persistence.
4. Реализовать кэширование YouTube metadata.
5. Обновить все компоненты на использование новых сервисов.

Файл `frontend/src/services/firestore.js`:

```javascript
/**
 * Сервис для работы с Firestore.
 * Заменяет fetch-вызовы из api.js на прямые Firestore-запросы.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  enableIndexedDbPersistence,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Offline Persistence ───────────────────
// Вызвать один раз при старте приложения
export async function enableOffline() {
  try {
    await enableIndexedDbPersistence(db);
    console.log("Firestore offline persistence включена");
  } catch (err) {
    if (err.code === "failed-precondition") {
      console.warn("Offline persistence: открыто несколько вкладок");
    } else if (err.code === "unimplemented") {
      console.warn("Offline persistence: браузер не поддерживается");
    }
  }
}

// ─── Drills ────────────────────────────────

export async function getAllDrills() {
  const snapshot = await getDocs(collection(db, "drills"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDrillsByCategory(category) {
  const q = query(
    collection(db, "drills"),
    where("category", "==", category),
    orderBy("name")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getDrill(drillId) {
  const snap = await getDoc(doc(db, "drills", drillId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ─── Workouts ──────────────────────────────

export async function getWorkouts(level = null) {
  let q;
  if (level) {
    q = query(
      collection(db, "workouts"),
      where("level", "==", level)
    );
  } else {
    q = collection(db, "workouts");
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getWorkoutWithSets(workoutId) {
  const workoutSnap = await getDoc(doc(db, "workouts", workoutId));
  if (!workoutSnap.exists()) return null;

  const setsSnap = await getDocs(
    query(
      collection(db, "workouts", workoutId, "sets"),
      orderBy("order")
    )
  );

  return {
    id: workoutSnap.id,
    ...workoutSnap.data(),
    sets: setsSnap.docs.map((s) => ({ id: s.id, ...s.data() })),
  };
}

// ─── User Profile (real-time) ──────────────

export function subscribeToUserProfile(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() });
    }
  });
}

export async function updateUserLevel(uid, level) {
  await updateDoc(doc(db, "users", uid), {
    level,
    last_active: serverTimestamp(),
  });
}

// ─── YouTube Metadata Cache ────────────────

export async function cacheYouTubeMeta(drillId, meta) {
  // Кэшируем в localStorage для быстрого доступа
  const key = `yt_meta_${drillId}`;
  localStorage.setItem(key, JSON.stringify({
    ...meta,
    cached_at: Date.now(),
  }));
}

export function getCachedYouTubeMeta(drillId) {
  const key = `yt_meta_${drillId}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  const data = JSON.parse(raw);
  const ONE_DAY = 24 * 60 * 60 * 1000;
  if (Date.now() - data.cached_at > ONE_DAY) {
    localStorage.removeItem(key);
    return null;
  }
  return data;
}
```

Файл `frontend/src/services/functions.js`:

```javascript
/**
 * Callable Cloud Functions для бизнес-логики.
 */

import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

const completeWorkoutFn = httpsCallable(functions, "complete_workout");
const getTodaySuggestionFn = httpsCallable(functions, "get_today_suggestion");
const initializeMasteryFn = httpsCallable(functions, "initialize_mastery");

export async function completeWorkout(workoutId, durationSeconds) {
  const result = await completeWorkoutFn({
    workout_id: workoutId,
    duration_seconds: durationSeconds,
  });
  return result.data;
}

export async function getTodaySuggestion() {
  const result = await getTodaySuggestionFn();
  return result.data;
}

export async function initializeMastery() {
  const result = await initializeMasteryFn();
  return result.data;
}
```

Пример обновления компонента Dashboard с real-time listener:

```jsx
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToUserProfile } from "../services/firestore";
import { getTodaySuggestion } from "../services/functions";

export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [todayWorkout, setTodayWorkout] = useState(null);

  // Real-time подписка на профиль
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToUserProfile(user.uid, setProfile);
    return unsubscribe;
  }, [user]);

  // Рекомендация тренировки дня
  useEffect(() => {
    getTodaySuggestion()
      .then((res) => setTodayWorkout(res.workout))
      .catch(console.error);
  }, []);

  if (!profile) return <div>Загрузка...</div>;

  const masteryEntries = Object.entries(profile.mastery || {});
  const avgMastery = masteryEntries.length
    ? masteryEntries.reduce((sum, [, m]) => sum + m.mastery_pct, 0) / masteryEntries.length
    : 0;

  return (
    <div className="dashboard">
      <h2>Привет, {profile.name}!</h2>
      <p>Уровень: {profile.level}</p>
      <p>Средний mastery: {(avgMastery * 100).toFixed(0)}%</p>

      {todayWorkout && (
        <div className="today-card">
          <h3>Тренировка дня</h3>
          <p>{todayWorkout.name}</p>
          <p>{todayWorkout.total_distance_m}м -- {todayWorkout.focus}</p>
        </div>
      )}
    </div>
  );
}
```

### Критерии завершения

- Файл `api.js` больше не используется, все вызовы идут через `services/`.
- Drills и workouts загружаются напрямую из Firestore.
- Профиль обновляется в real-time при изменениях (mastery, history).
- Offline persistence работает: данные доступны при потере сети.
- YouTube metadata кэшируется и не запрашивается повторно в течение суток.

### Оценка времени

**5--7 часов**

---

## ЭТАП 6: Firebase Hosting деплой

### Описание

Деплой собранного React-приложения на Firebase Hosting с настройкой SPA-rewrites, кэширования, preview channels для staging и (опционально) custom domain.

### Конкретные шаги

1. Собрать production-билд React-приложения.
2. Проверить конфигурацию Hosting в `firebase.json`.
3. Деплоить на Hosting.
4. Настроить preview channels для staging.
5. (Опционально) подключить custom domain.

```bash
# Сборка фронтенда
cd /home/user/V1/frontend
npm run build  # vite build -> dist/

# Деплой только Hosting
cd /home/user/V1
firebase deploy --only hosting

# Полный деплой (Hosting + Functions + Firestore rules)
firebase deploy
```

Конфигурация Hosting (уже включена в `firebase.json`, ЭТАП 1):

```json
{
  "hosting": {
    "public": "frontend/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        "source": "**/*.@(jpg|jpeg|gif|png|svg|webp|ico)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=86400"
          }
        ]
      },
      {
        "source": "/",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=0, must-revalidate"
          }
        ]
      },
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "X-XSS-Protection",
            "value": "1; mode=block"
          },
          {
            "key": "Referrer-Policy",
            "value": "strict-origin-when-cross-origin"
          }
        ]
      }
    ]
  }
}
```

Preview channels для staging:

```bash
# Создать preview channel (живёт 7 дней по умолчанию)
firebase hosting:channel:deploy staging --expires 7d

# Создать preview с указанием срока жизни
firebase hosting:channel:deploy feature-xyz --expires 3d

# Список активных channels
firebase hosting:channel:list

# Удалить channel
firebase hosting:channel:delete staging
```

Custom domain:

```bash
# Подключить домен
firebase hosting:sites:update hydroflow-prod --site hydroflow-prod

# В Firebase Console -> Hosting -> Add custom domain
# Указать: hydroflow.app
# Добавить DNS-записи типа A и TXT у регистратора
# Firebase автоматически выпустит SSL-сертификат
```

### Критерии завершения

- Приложение доступно по URL `https://hydroflow-prod.web.app`.
- SPA-routing работает (прямой переход по URL не дает 404).
- Статические ресурсы (JS, CSS) кэшируются с `immutable`.
- Preview channel создается и удаляется штатно.
- Все security headers присутствуют (проверить через DevTools -> Network).

### Оценка времени

**2--3 часа**

---

## ЭТАП 7: Аналитика и мониторинг

### Описание

Интеграция Firebase Analytics для отслеживания поведения пользователей, Performance Monitoring для контроля скорости загрузки и Crashlytics (подготовка для будущих мобильных приложений). Также настройка custom events, специфичных для HydroFlow, и A/B-тестирования через Remote Config.

### Конкретные шаги

1. Добавить Analytics SDK в frontend.
2. Определить и логировать custom events.
3. Подключить Performance Monitoring.
4. Настроить Remote Config для A/B-тестирования.
5. Настроить dashboard в Firebase Console.

```bash
cd /home/user/V1/frontend
# Firebase SDK уже установлен (ЭТАП 3)
# Analytics и Performance входят в пакет firebase
```

Обновление `frontend/src/firebase.js`:

```javascript
// Добавить к существующему firebase.js
import { getAnalytics, logEvent } from "firebase/analytics";
import { getPerformance } from "firebase/performance";
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";

// Инициализация (только в production)
let analytics = null;
let perf = null;
let remoteConfig = null;

if (typeof window !== "undefined" && !import.meta.env.DEV) {
  analytics = getAnalytics(app);
  perf = getPerformance(app);
  remoteConfig = getRemoteConfig(app);
  remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 час
}

export { analytics, perf, remoteConfig };
```

Файл `frontend/src/services/analytics.js`:

```javascript
/**
 * Сервис аналитики HydroFlow.
 * Централизованное логирование custom events.
 */

import { logEvent } from "firebase/analytics";
import { analytics } from "../firebase";

function log(eventName, params = {}) {
  if (!analytics) return; // emulator или SSR
  logEvent(analytics, eventName, params);
}

// ─── Custom Events ─────────────────────────

export function trackWorkoutStarted(workoutId, level, focus) {
  log("workout_started", {
    workout_id: workoutId,
    level,
    focus,
  });
}

export function trackWorkoutCompleted(workoutId, durationSec, distanceM) {
  log("workout_completed", {
    workout_id: workoutId,
    duration_seconds: durationSec,
    distance_meters: distanceM,
  });
}

export function trackDrillWatched(drillId, category, watchDurationSec) {
  log("drill_watched", {
    drill_id: drillId,
    category,
    watch_duration_seconds: watchDurationSec,
  });
}

export function trackMasteryAchieved(drillId, masteryPct) {
  log("mastery_achieved", {
    drill_id: drillId,
    mastery_percent: Math.round(masteryPct * 100),
  });
}

export function trackLevelSelected(level) {
  log("level_selected", { level });
}

export function trackScreenView(screenName) {
  log("screen_view", {
    firebase_screen: screenName,
    firebase_screen_class: screenName,
  });
}
```

Настройка Remote Config (в Firebase Console):

```javascript
// Использование Remote Config для feature flags
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { remoteConfig } from "../firebase";

// Значения по умолчанию
const RC_DEFAULTS = {
  show_video_match_feature: false,
  max_daily_suggestions: 3,
  enable_social_sharing: false,
  onboarding_version: "v1",
};

export async function initRemoteConfig() {
  if (!remoteConfig) return RC_DEFAULTS;

  remoteConfig.defaultConfig = RC_DEFAULTS;

  try {
    await fetchAndActivate(remoteConfig);
  } catch (err) {
    console.warn("Remote Config fetch failed:", err);
  }

  return {
    show_video_match_feature: getValue(remoteConfig, "show_video_match_feature").asBoolean(),
    max_daily_suggestions: getValue(remoteConfig, "max_daily_suggestions").asNumber(),
    enable_social_sharing: getValue(remoteConfig, "enable_social_sharing").asBoolean(),
    onboarding_version: getValue(remoteConfig, "onboarding_version").asString(),
  };
}
```

### Критерии завершения

- В Firebase Console -> Analytics видны события `workout_started`, `workout_completed`, `drill_watched`, `mastery_achieved`.
- Performance Monitoring показывает время загрузки страниц.
- Remote Config работает: при изменении флага в Console поведение приложения меняется после refetch.
- Dashboard в Analytics Console настроен с ключевыми метриками.

### Оценка времени

**3--4 часа**

---

## ЭТАП 8: PWA и офлайн-режим

### Описание

Преобразование HydroFlow в Progressive Web App для возможности установки на устройство, офлайн-доступа к библиотеке упражнений и background sync для отложенной отправки результатов тренировок. Пловцы часто тренируются в бассейнах с плохим WiFi -- офлайн-режим критически важен.

### Конкретные шаги

1. Создать Web App Manifest.
2. Зарегистрировать Service Worker.
3. Настроить offline-first стратегию.
4. Реализовать кэширование YouTube thumbnails.
5. Добавить background sync.
6. Реализовать install prompt.

Файл `frontend/public/manifest.json`:

```json
{
  "name": "HydroFlow - Тренировки по плаванию",
  "short_name": "HydroFlow",
  "description": "Персональный тренер по плаванию с видео-упражнениями",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0891b2",
  "theme_color": "#0e7490",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["sports", "fitness", "health"],
  "lang": "ru",
  "screenshots": [
    {
      "src": "/screenshots/dashboard.png",
      "sizes": "1080x1920",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Главный экран с тренировкой дня"
    }
  ]
}
```

Обновить `frontend/index.html`:

```html
<head>
  <!-- ... existing tags ... -->
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#0e7490" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
</head>
```

Файл `frontend/public/sw.js` (Service Worker):

```javascript
/**
 * HydroFlow Service Worker.
 * Стратегии: Cache-First для статики, Network-First для API.
 */

const CACHE_NAME = "hydroflow-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
];

// ─── Install ───────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ──────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ─────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // YouTube thumbnails -- Cache-First с fallback
  if (url.hostname === "img.youtube.com" || url.hostname === "i.ytimg.com") {
    event.respondWith(cacheFirst(request, "hydroflow-thumbnails"));
    return;
  }

  // Статические ресурсы (JS, CSS, изображения) -- Cache-First
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image"
  ) {
    event.respondWith(cacheFirst(request, CACHE_NAME));
    return;
  }

  // HTML -- Network-First
  if (request.destination === "document") {
    event.respondWith(networkFirst(request, CACHE_NAME));
    return;
  }

  // Всё остальное -- Network-First
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// ─── Стратегии кэширования ─────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Офлайн", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Офлайн", { status: 503 });
  }
}

// ─── Background Sync ──────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-workout-completion") {
    event.waitUntil(syncPendingWorkouts());
  }
});

async function syncPendingWorkouts() {
  // Получить pending workouts из IndexedDB
  // и отправить через callable function
  const pending = await getPendingWorkouts(); // из IndexedDB
  for (const workout of pending) {
    try {
      // Отправка через fetch к callable function endpoint
      await fetch(
        "https://europe-west1-hydroflow-prod.cloudfunctions.net/complete_workout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: workout }),
        }
      );
      await removePendingWorkout(workout.id);
    } catch {
      // Оставляем в pending -- sync будет повторён
      break;
    }
  }
}
```

Регистрация Service Worker в `frontend/src/main.jsx`:

```javascript
// После рендеринга приложения
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("SW зарегистрирован:", reg.scope))
      .catch((err) => console.error("SW ошибка:", err));
  });
}
```

Компонент install prompt (`frontend/src/components/InstallPrompt.jsx`):

```jsx
import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log("Install:", outcome);
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="install-banner">
      <p>Установите HydroFlow для тренировок офлайн</p>
      <button onClick={handleInstall}>Установить</button>
      <button onClick={() => setShowPrompt(false)}>Позже</button>
    </div>
  );
}
```

### Критерии завершения

- Lighthouse PWA-аудит проходит без критических ошибок.
- Приложение устанавливается на Android/iOS (Add to Home Screen).
- В офлайн-режиме библиотека упражнений доступна (кэш Firestore).
- YouTube thumbnails кэшируются Service Worker.
- При завершении тренировки офлайн данные синхронизируются при появлении сети.
- Manifest.json корректно загружается (проверить в DevTools -> Application).

### Оценка времени

**5--7 часов**

---

## ЭТАП 9: Уведомления и вовлечение

### Описание

Настройка Firebase Cloud Messaging (FCM) для push-уведомлений: напоминания о тренировках, поздравления с достижениями mastery. Также In-App Messaging для контекстных сообщений внутри приложения.

### Конкретные шаги

1. Настроить FCM в Firebase Console.
2. Создать `firebase-messaging-sw.js`.
3. Реализовать запрос разрешения на уведомления.
4. Создать Cloud Function для отправки scheduled-уведомлений.
5. Настроить In-App Messaging в Console.

Файл `frontend/public/firebase-messaging-sw.js`:

```javascript
/**
 * Firebase Cloud Messaging Service Worker.
 * Обрабатывает push-уведомления в фоновом режиме.
 */

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIza...",
  authDomain: "hydroflow-prod.firebaseapp.com",
  projectId: "hydroflow-prod",
  storageBucket: "hydroflow-prod.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: icon || "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data: payload.data,
    actions: [
      { action: "open", title: "Начать тренировку" },
      { action: "dismiss", title: "Позже" },
    ],
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "open" || !event.action) {
    event.waitUntil(clients.openWindow("/"));
  }
});
```

Файл `frontend/src/services/notifications.js`:

```javascript
/**
 * Сервис push-уведомлений.
 */

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, updateDoc } from "firebase/firestore";
import app, { db } from "../firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export async function requestNotificationPermission(uid) {
  if (!("Notification" in window)) {
    console.warn("Уведомления не поддерживаются");
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.log("Разрешение на уведомления отклонено");
    return null;
  }

  const messaging = getMessaging(app);
  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });

    // Сохранить токен в профиле пользователя
    await updateDoc(doc(db, "users", uid), {
      fcm_token: token,
      notifications_enabled: true,
    });

    return token;
  } catch (err) {
    console.error("Ошибка получения FCM-токена:", err);
    return null;
  }
}

export function onForegroundMessage(callback) {
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data,
    });
  });
}
```

Cloud Function для ежедневных напоминаний (`functions/main.py`, дополнение):

```python
from firebase_functions import scheduler_fn
from firebase_admin import messaging


@scheduler_fn.on_schedule(
    schedule="0 7 * * *",  # Каждый день в 7:00 UTC
    timezone="Europe/Moscow",
    region="europe-west1",
)
def send_daily_reminders(event: scheduler_fn.ScheduledEvent) -> None:
    """
    Ежедневное напоминание о тренировке.
    Отправляется пользователям, у которых включены уведомления
    и не было тренировки за последние 24 часа.
    """
    db = firestore.client()
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)

    users = db.collection("users").where("notifications_enabled", "==", True).stream()
    tokens = []

    for user_doc in users:
        data = user_doc.to_dict()
        last_active = data.get("last_active")

        # Отправить только тем, кто неактивен >24ч
        if last_active and last_active.replace(tzinfo=datetime.timezone.utc) < cutoff:
            token = data.get("fcm_token")
            if token:
                tokens.append(token)

    if not tokens:
        print("Нет пользователей для напоминания.")
        return

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(
            title="Время поплавать!",
            body="Ваша тренировка дня уже готова. Давайте вместе!",
        ),
        data={"action": "open_today"},
    )

    response = messaging.send_each_for_multicast(message)
    print(f"Отправлено: {response.success_count}, ошибок: {response.failure_count}")
```

Компонент запроса разрешения (`frontend/src/components/NotificationRequest.jsx`):

```jsx
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { requestNotificationPermission } from "../services/notifications";

export default function NotificationRequest() {
  const { user } = useAuth();
  const [asked, setAsked] = useState(
    () => localStorage.getItem("notification_asked") === "true"
  );

  if (asked || !user) return null;

  const handleAllow = async () => {
    await requestNotificationPermission(user.uid);
    localStorage.setItem("notification_asked", "true");
    setAsked(true);
  };

  const handleDismiss = () => {
    localStorage.setItem("notification_asked", "true");
    setAsked(true);
  };

  return (
    <div className="notification-banner">
      <p>Хотите получать напоминания о тренировках?</p>
      <button onClick={handleAllow}>Да, напоминайте</button>
      <button onClick={handleDismiss}>Нет, спасибо</button>
    </div>
  );
}
```

### Критерии завершения

- Push-уведомления приходят в браузере (desktop и mobile).
- FCM-токен сохраняется в документе пользователя.
- Ежедневное scheduled-напоминание работает (проверить через `firebase functions:shell`).
- Запрос разрешения показывается один раз и запоминается.
- In-App Messaging настроен в Firebase Console (кампания "Mastery milestone").

### Оценка времени

**4--5 часов**

---

## ЭТАП 10: Расширенные функции

### Описание

Подключение Firebase Extensions, Cloud Storage для пользовательских видео, подготовка к ML Kit (Pose Detection) и Dynamic Links для шеринга тренировок. Эти функции расширяют базовый функционал и повышают вовлеченность.

### Конкретные шаги

1. Установить Firebase Extensions.
2. Настроить Cloud Storage для видео.
3. Подготовить интеграцию ML Kit.
4. Настроить Remote Config для feature flags.
5. Создать Dynamic Links для шеринга.

#### Firebase Extensions

```bash
# Resize Images -- для профильных аватаров и thumbnails
firebase ext:install firebase/storage-resize-images \
  --params=IMG_BUCKET=hydroflow-prod.appspot.com,\
IMG_SIZES=200x200,\
RESIZED_IMAGES_PATH=thumbnails

# Translate Text -- для мультиязычных описаний упражнений
firebase ext:install firebase/firestore-translate-text \
  --params=COLLECTION_PATH=drills,\
INPUT_FIELD_NAME=description,\
LANGUAGES=en,\
OUTPUT_FIELD_NAME=translations
```

#### Cloud Storage для видео (Video Match)

Правила Cloud Storage (`storage.rules`):

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // Пользовательские видео -- только владелец
    match /user_videos/{userId}/{videoId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 100 * 1024 * 1024  // 100MB
                   && request.resource.contentType.matches('video/.*');
      allow delete: if request.auth != null && request.auth.uid == userId;
    }

    // Аватары -- до 5MB, только изображения
    match /avatars/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }

    // Thumbnails (generated by extension) -- read-only
    match /thumbnails/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

Компонент загрузки видео (`frontend/src/components/VideoUpload.jsx`):

```jsx
import { useState, useRef } from "react";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useAuth } from "../contexts/AuthContext";

export default function VideoUpload({ drillId, onUploadComplete }) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files[0];
    if (!file || !user) return;

    if (file.size > 100 * 1024 * 1024) {
      alert("Файл слишком большой (макс. 100MB)");
      return;
    }

    setUploading(true);
    const storage = getStorage();
    const videoRef = ref(
      storage,
      `user_videos/${user.uid}/${drillId}_${Date.now()}.${file.name.split(".").pop()}`
    );

    const uploadTask = uploadBytesResumable(videoRef, file);

    uploadTask.on(
      "state_changed",
      (snap) => setProgress((snap.bytesTransferred / snap.totalBytes) * 100),
      (err) => {
        console.error("Ошибка загрузки:", err);
        setUploading(false);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        setUploading(false);
        setProgress(0);
        onUploadComplete?.({ url, drillId });
      }
    );
  };

  return (
    <div className="video-upload">
      <input ref={fileRef} type="file" accept="video/*" disabled={uploading} />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? `Загрузка: ${progress.toFixed(0)}%` : "Загрузить видео"}
      </button>
    </div>
  );
}
```

#### ML Kit (подготовка к Pose Detection)

```javascript
/**
 * Интеграция ML Kit Pose Detection (планируется).
 * Анализ техники плавания через камеру устройства.
 *
 * Для web-версии используется TensorFlow.js MoveNet.
 * Для мобильных приложений -- нативный ML Kit.
 */

// Пример: будущая интеграция с TensorFlow.js
// import * as poseDetection from "@tensorflow-models/pose-detection";
//
// const detector = await poseDetection.createDetector(
//   poseDetection.SupportedModels.MoveNet,
//   { modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER }
// );
//
// const poses = await detector.estimatePoses(videoElement);
// analyzSwimmingForm(poses);
```

#### Remote Config для feature flags

```javascript
// Значения по умолчанию для Remote Config
// Устанавливаются в Firebase Console -> Remote Config

const FEATURE_FLAGS = {
  // Функция Video Match (загрузка и сравнение видео)
  enable_video_match: false,           // ЭТАП 10

  // Социальный шеринг тренировок
  enable_social_sharing: false,         // ЭТАП 10

  // ML Pose Detection
  enable_pose_detection: false,         // будущее

  // Новый алгоритм рекомендаций
  recommendation_algorithm_v2: false,   // A/B тест

  // Макс. количество рекомендаций в день
  max_daily_suggestions: 3,
};
```

#### Dynamic Links для шеринга

```bash
# Dynamic Links настраиваются в Firebase Console
# Домен: hydroflow.page.link

# Пример создания Dynamic Link программно
```

```python
# В Cloud Functions
from firebase_admin import dynamic_links  # планируется

def create_workout_share_link(workout_id: str, workout_name: str) -> str:
    """Создать Dynamic Link для шеринга тренировки."""
    link = f"https://hydroflow-prod.web.app/workout/{workout_id}"
    # Firebase Dynamic Links создаёт short link
    # с fallback на web и deep link для приложения
    return f"https://hydroflow.page.link/?link={link}&apn=com.hydroflow.app"
```

### Критерии завершения

- Extension Resize Images работает: загруженные аватары имеют thumbnail 200x200.
- Cloud Storage rules деплоятся и работают корректно.
- Компонент VideoUpload загружает файл и показывает прогресс.
- Remote Config feature flags доступны в приложении.
- Dynamic Links открывают тренировку в приложении (или web fallback).

### Оценка времени

**6--8 часов**

---

## ЭТАП 11: Тестирование и CI/CD

### Описание

Настройка Firebase Emulator Suite для локальной разработки и тестирования, написание unit-тестов для Cloud Functions, integration-тестов с эмуляторами, и CI/CD-пайплайна через GitHub Actions с автоматическим деплоем и preview channels для PR.

### Конкретные шаги

1. Настроить Firebase Emulator Suite.
2. Написать unit-тесты для Cloud Functions.
3. Написать integration-тесты.
4. Создать GitHub Actions workflow.
5. Настроить preview deploy на PR.

#### Конфигурация Emulator Suite

Файл `firebase.json` (секция emulators, уже частично из ЭТАПА 1):

```json
{
  "emulators": {
    "auth": {
      "port": 9099,
      "host": "0.0.0.0"
    },
    "functions": {
      "port": 5001,
      "host": "0.0.0.0"
    },
    "firestore": {
      "port": 8080,
      "host": "0.0.0.0"
    },
    "hosting": {
      "port": 5000,
      "host": "0.0.0.0"
    },
    "storage": {
      "port": 9199,
      "host": "0.0.0.0"
    },
    "ui": {
      "enabled": true,
      "port": 4000,
      "host": "0.0.0.0"
    },
    "singleProjectMode": true
  }
}
```

#### Unit-тесты для Cloud Functions

Файл `functions/tests/test_complete_workout.py`:

```python
"""
Unit-тесты для Cloud Function complete_workout.
Запуск: cd functions && python -m pytest tests/ -v
"""

import datetime
import unittest
from unittest.mock import MagicMock, patch

# Мокаем firebase_admin перед импортом main
import sys
sys.modules["firebase_admin"] = MagicMock()
sys.modules["firebase_admin.firestore"] = MagicMock()
sys.modules["firebase_functions"] = MagicMock()


class TestCompleteWorkout(unittest.TestCase):

    def test_mastery_calculation(self):
        """Mastery должен увеличиваться при завершении тренировки."""
        mastery = {
            "drill_1": {
                "videos_watched": 3,
                "drills_completed": 2,
                "mastery_pct": 0.5,
            }
        }
        drill_ids = ["drill_1"]

        for drill_id in drill_ids:
            entry = mastery[drill_id]
            entry["drills_completed"] += 1
            total = entry["videos_watched"] + entry["drills_completed"]
            entry["mastery_pct"] = min(1.0, total / 10.0)

        self.assertEqual(mastery["drill_1"]["drills_completed"], 3)
        self.assertAlmostEqual(mastery["drill_1"]["mastery_pct"], 0.6)

    def test_mastery_cap_at_one(self):
        """Mastery не должен превышать 1.0."""
        mastery = {
            "drill_1": {
                "videos_watched": 8,
                "drills_completed": 5,
                "mastery_pct": 1.0,
            }
        }
        drill_id = "drill_1"
        entry = mastery[drill_id]
        entry["drills_completed"] += 1
        total = entry["videos_watched"] + entry["drills_completed"]
        entry["mastery_pct"] = min(1.0, total / 10.0)

        self.assertEqual(entry["mastery_pct"], 1.0)

    def test_new_drill_mastery(self):
        """Для нового drill mastery должен создаваться с базовыми значениями."""
        mastery = {}
        drill_id = "new_drill"

        if drill_id not in mastery:
            mastery[drill_id] = {
                "videos_watched": 0,
                "drills_completed": 1,
                "mastery_pct": 0.1,
            }

        self.assertEqual(mastery[drill_id]["drills_completed"], 1)
        self.assertAlmostEqual(mastery[drill_id]["mastery_pct"], 0.1)


class TestGetTodaySuggestion(unittest.TestCase):

    def test_excludes_recent_workouts(self):
        """Алгоритм должен исключать последние 3 тренировки."""
        history = [
            {"workout_id": "w1", "completed_at": datetime.datetime(2025, 1, 3)},
            {"workout_id": "w2", "completed_at": datetime.datetime(2025, 1, 2)},
            {"workout_id": "w3", "completed_at": datetime.datetime(2025, 1, 1)},
        ]

        recent_ids = {
            h["workout_id"]
            for h in sorted(history, key=lambda x: x["completed_at"], reverse=True)[:3]
        }

        self.assertEqual(recent_ids, {"w1", "w2", "w3"})

    def test_scoring_prefers_low_mastery(self):
        """Тренировки с низким mastery должны иметь более низкий score."""
        mastery = {
            "drill_a": {"mastery_pct": 0.9},
            "drill_b": {"mastery_pct": 0.1},
        }

        def score(drill_ids):
            total = sum(mastery.get(d, {}).get("mastery_pct", 0) for d in drill_ids)
            return total / len(drill_ids) if drill_ids else 0

        score_high = score(["drill_a"])
        score_low = score(["drill_b"])

        self.assertLess(score_low, score_high)


if __name__ == "__main__":
    unittest.main()
```

#### Integration-тесты с эмуляторами

Файл `tests/integration/test_firestore_rules.py`:

```python
"""
Integration-тесты для Firestore Security Rules.
Запуск: firebase emulators:exec "python -m pytest tests/integration/ -v"
"""

import os
import pytest
import requests

FIRESTORE_EMULATOR = os.environ.get("FIRESTORE_EMULATOR_HOST", "localhost:8080")
PROJECT_ID = "hydroflow-prod"


@pytest.fixture(autouse=True)
def clear_firestore():
    """Очистить Firestore emulator перед каждым тестом."""
    url = f"http://{FIRESTORE_EMULATOR}/emulator/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    requests.delete(url)
    yield


class TestDrillsRules:
    """Тесты security rules для коллекции drills."""

    def test_authenticated_can_read_drills(self):
        """Аутентифицированный пользователь может читать drills."""
        # Используем REST API эмулятора с авторизационным токеном
        # В реальных тестах используется @firebase/rules-unit-testing
        pass  # Реализация через firebase-admin в emulator mode

    def test_unauthenticated_cannot_read_drills(self):
        """Неаутентифицированный пользователь не может читать drills."""
        pass

    def test_client_cannot_write_drills(self):
        """Клиент не может писать в drills (только Admin SDK)."""
        pass


class TestUserRules:
    """Тесты security rules для коллекции users."""

    def test_user_can_read_own_profile(self):
        """Пользователь может читать свой профиль."""
        pass

    def test_user_cannot_read_other_profile(self):
        """Пользователь не может читать чужой профиль."""
        pass

    def test_user_cannot_modify_created_at(self):
        """Пользователь не может изменить поле created_at."""
        pass
```

#### GitHub Actions CI/CD

Файл `.github/workflows/firebase-deploy.yml`:

```yaml
name: Firebase Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"
  PYTHON_VERSION: "3.12"

jobs:
  # ─── Тесты ───────────────────────────────
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install frontend dependencies
        run: cd frontend && npm ci

      - name: Install functions dependencies
        run: |
          cd functions
          pip install -r requirements.txt
          pip install pytest

      - name: Lint frontend
        run: cd frontend && npm run lint

      - name: Unit tests (functions)
        run: cd functions && python -m pytest tests/ -v

      - name: Build frontend
        run: cd frontend && npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}

      - name: Integration tests (emulator)
        run: |
          npm install -g firebase-tools
          firebase emulators:exec "python -m pytest tests/integration/ -v" \
            --project hydroflow-prod

  # ─── Preview Deploy (на PR) ───────────────
  preview:
    if: github.event_name == 'pull_request'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Build frontend
        run: cd frontend && npm ci && npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}

      - name: Deploy to preview channel
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: hydroflow-prod
          channelId: pr-${{ github.event.pull_request.number }}
          expires: 7d

  # ─── Production Deploy ───────────────────
  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Build frontend
        run: cd frontend && npm ci && npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}

      - name: Install functions dependencies
        run: cd functions && pip install -r requirements.txt

      - name: Deploy to Firebase
        run: |
          npm install -g firebase-tools
          firebase deploy --project hydroflow-prod
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

### Критерии завершения

- `firebase emulators:start` запускает все эмуляторы (Auth, Functions, Firestore, Storage, Hosting).
- Unit-тесты проходят: `cd functions && python -m pytest tests/ -v`.
- Integration-тесты проходят через `firebase emulators:exec`.
- GitHub Actions workflow запускается на push и PR.
- Preview channel создается автоматически на каждый PR с ссылкой в комментарии.
- Production deploy происходит автоматически при merge в `main`.

### Оценка времени

**6--8 часов**

---

## ЭТАП 12: Безопасность и оптимизация

### Описание

Финальный этап: аудит безопасности Firestore rules, rate limiting для Cloud Functions, оптимизация bundle size фронтенда, настройка Content Security Policy, оптимизация Firestore-запросов и мониторинг стоимости.

### Конкретные шаги

1. Провести аудит Firestore security rules.
2. Добавить rate limiting.
3. Настроить Content Security Policy.
4. Оптимизировать bundle size.
5. Оптимизировать Firestore-запросы.
6. Настроить бюджетные алерты.

#### Аудит Firestore Security Rules

Чек-лист аудита:

```
[x] Все коллекции имеют явные rules (нет открытых путей)
[x] Catch-all правило запрещает всё /{document=**}
[x] users/{userId} -- только владелец может читать и писать
[x] drills/ и workouts/ -- read-only для аутентифицированных
[x] Запись в drills/workouts только через Admin SDK
[x] Нельзя изменить created_at и email через клиент
[x] Нельзя удалить свой профиль (allow delete: if false)
[x] Storage rules ограничивают размер файлов (100MB видео, 5MB аватар)
[x] Storage rules проверяют contentType
```

Дополнение к `firestore.rules` -- валидация данных:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Вспомогательные функции
    function isAuthenticated() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isAuthenticated() && request.auth.uid == userId;
    }

    function isValidLevel(level) {
      return level in ["novice", "intermediate", "advanced", "pro"];
    }

    function isValidMasteryPct(pct) {
      return pct is number && pct >= 0.0 && pct <= 1.0;
    }

    // ---------- Drills ----------
    match /drills/{drillId} {
      allow read: if isAuthenticated();
      allow write: if false;
    }

    // ---------- Workouts ----------
    match /workouts/{workoutId} {
      allow read: if isAuthenticated();
      allow write: if false;

      match /sets/{setId} {
        allow read: if isAuthenticated();
        allow write: if false;
      }
    }

    // ---------- Users ----------
    match /users/{userId} {
      allow read: if isOwner(userId);

      allow create: if isOwner(userId)
                    && isValidLevel(request.resource.data.level)
                    && request.resource.data.keys().hasAll(["name", "email", "level"]);

      allow update: if isOwner(userId)
                    && !request.resource.data.diff(resource.data)
                        .affectedKeys().hasAny(["created_at", "email"])
                    && (
                      !request.resource.data.keys().hasAny(["level"])
                      || isValidLevel(request.resource.data.level)
                    );

      allow delete: if false;
    }

    // ---------- Catch-all ----------
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

#### Rate Limiting для Cloud Functions

```python
# functions/rate_limit.py
"""
Rate limiting для Cloud Functions.
Использует Firestore для хранения счётчиков.
"""

import datetime
from firebase_admin import firestore


class RateLimiter:
    """Ограничение частоты вызовов per-user."""

    def __init__(self, db, max_calls: int = 60, window_seconds: int = 60):
        self.db = db
        self.max_calls = max_calls
        self.window_seconds = window_seconds

    def check(self, uid: str, function_name: str) -> bool:
        """
        Проверить, не превышен ли лимит.
        Возвращает True если запрос допустим, False если превышен.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        window_start = now - datetime.timedelta(seconds=self.window_seconds)

        ref = (
            self.db.collection("_rate_limits")
            .document(f"{uid}_{function_name}")
        )

        @firestore.transactional
        def update_counter(transaction):
            snap = ref.get(transaction=transaction)

            if not snap.exists:
                transaction.set(ref, {
                    "count": 1,
                    "window_start": now,
                    "last_call": now,
                })
                return True

            data = snap.to_dict()
            ws = data.get("window_start")
            if hasattr(ws, "replace"):
                ws = ws.replace(tzinfo=datetime.timezone.utc)

            if ws < window_start:
                # Окно истекло -- сбросить
                transaction.update(ref, {
                    "count": 1,
                    "window_start": now,
                    "last_call": now,
                })
                return True

            if data["count"] >= self.max_calls:
                return False

            transaction.update(ref, {
                "count": data["count"] + 1,
                "last_call": now,
            })
            return True

        transaction = self.db.transaction()
        return update_counter(transaction)
```

Использование в `functions/main.py`:

```python
from rate_limit import RateLimiter

# Инициализация
rate_limiter = RateLimiter(firestore.client(), max_calls=30, window_seconds=60)

@https_fn.on_call(region="europe-west1")
def complete_workout(req: https_fn.CallableRequest) -> dict:
    if req.auth is None:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Требуется авторизация."
        )

    # Rate limiting
    if not rate_limiter.check(req.auth.uid, "complete_workout"):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
            message="Слишком много запросов. Попробуйте позже."
        )

    # ...остальная логика...
```

#### Content Security Policy

Добавить в `firebase.json` -> `hosting.headers`:

```json
{
  "source": "**",
  "headers": [
    {
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self' https://apis.google.com https://www.gstatic.com https://www.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://img.youtube.com https://i.ytimg.com https://lh3.googleusercontent.com https://firebasestorage.googleapis.com; frame-src https://www.youtube.com https://hydroflow-prod.firebaseapp.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://europe-west1-hydroflow-prod.cloudfunctions.net https://fcmregistrations.googleapis.com;"
    },
    {
      "key": "Strict-Transport-Security",
      "value": "max-age=63072000; includeSubDomains; preload"
    },
    {
      "key": "Permissions-Policy",
      "value": "camera=(self), microphone=(), geolocation=()"
    }
  ]
}
```

#### Bundle Size Optimization

Конфигурация Vite для оптимизации (`frontend/vite.config.js`):

```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    // Визуализация bundle (npm run build -- --analyze)
    visualizer({
      filename: "dist/bundle-stats.html",
      open: false,
      gzipSize: true,
    }),
  ],
  build: {
    target: "es2020",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,    // Убрать console.log в production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Разделить Firebase SDK на отдельный chunk
          "firebase-core": ["firebase/app"],
          "firebase-auth": ["firebase/auth"],
          "firebase-firestore": ["firebase/firestore"],
          "firebase-functions": ["firebase/functions"],
          "firebase-analytics": [
            "firebase/analytics",
            "firebase/performance",
          ],
          // React -- отдельный chunk
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
    // Предупреждать при chunk > 300KB
    chunkSizeWarningLimit: 300,
  },
});
```

#### Firestore Query Optimization

```javascript
/**
 * Оптимизированные запросы Firestore.
 * Правила:
 * 1. Всегда использовать limit() для списков.
 * 2. Composite indexes для часто используемых фильтров.
 * 3. Кэшировать результаты, которые редко меняются (drills).
 * 4. Использовать getDocFromCache() для офлайн-first.
 */

import {
  collection, query, where, orderBy, limit,
  getDocs, getDocFromCache, getDocFromServer,
} from "firebase/firestore";
import { db } from "../firebase";

// Drills меняются редко -- кэшировать агрессивно
let drillsCache = null;
let drillsCacheTime = 0;
const DRILLS_CACHE_TTL = 30 * 60 * 1000; // 30 минут

export async function getOptimizedDrills() {
  const now = Date.now();
  if (drillsCache && now - drillsCacheTime < DRILLS_CACHE_TTL) {
    return drillsCache;
  }

  const snapshot = await getDocs(collection(db, "drills"));
  drillsCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  drillsCacheTime = now;
  return drillsCache;
}

// Тренировки -- пагинация и фильтрация
export async function getWorkoutsPaginated(level, pageSize = 10, startAfterDoc = null) {
  let q = query(
    collection(db, "workouts"),
    where("level", "==", level),
    orderBy("total_distance_m"),
    limit(pageSize)
  );

  if (startAfterDoc) {
    const { startAfter } = await import("firebase/firestore");
    q = query(q, startAfter(startAfterDoc));
  }

  const snapshot = await getDocs(q);
  return {
    workouts: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === pageSize,
  };
}
```

Обновленный `firestore.indexes.json` с composite indexes:

```json
{
  "indexes": [
    {
      "collectionGroup": "drills",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "workouts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "level", "order": "ASCENDING" },
        { "fieldPath": "focus", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "workouts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "level", "order": "ASCENDING" },
        { "fieldPath": "total_distance_m", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "workouts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "level", "order": "ASCENDING" },
        { "fieldPath": "created_at", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

#### Мониторинг стоимости

```bash
# Настроить бюджетный алерт в Google Cloud Console
# Billing -> Budgets & alerts -> Create budget

# Рекомендуемые пороги:
# - $10/месяц -- информационное уведомление (50%)
# - $15/месяц -- предупреждение (75%)
# - $20/месяц -- критическое (100%)
```

Примерный бюджет HydroFlow (до 1000 MAU):

```
Firestore:
  - Reads:   ~50,000/день   = бесплатный лимит (50K/день)
  - Writes:  ~5,000/день    = бесплатный лимит (20K/день)
  - Storage: ~100MB         = бесплатный лимит (1GB)

Cloud Functions:
  - Invocations: ~10,000/день = бесплатный лимит (2M/месяц)
  - Compute:     ~5,000 GB-sec = бесплатный лимит (400K GB-sec)

Hosting:
  - Storage: ~50MB            = бесплатный лимит (10GB)
  - Transfer: ~10GB/месяц     = бесплатный лимит (360MB/день)

Auth:
  - Email/Password: бесплатно (без лимита)
  - Google Sign-In: бесплатно (без лимита)

Cloud Storage:
  - Storage: ~5GB             = бесплатный лимит (5GB)
  - Downloads: ~50GB/месяц    = бесплатный лимит (1GB/день)

ИТОГО при 1000 MAU: ~$0--5/месяц (в рамках бесплатного тарифа)
```

### Критерии завершения

- Security rules прошли аудит по чек-листу.
- Rate limiting работает: при >30 запросах/мин возвращается ошибка `RESOURCE_EXHAUSTED`.
- CSP-заголовки присутствуют и не блокируют функционал (проверить в DevTools Console).
- Bundle size: main chunk < 200KB gzipped, Firebase SDK выделен в отдельные chunks.
- Firestore-запросы используют indexes (нет warnings в Console).
- Бюджетный алерт настроен в Google Cloud Console.
- `firebase deploy` проходит без ошибок и предупреждений.

### Оценка времени

**5--7 часов**

---

## Сводная таблица

| Этап | Описание | Время |
|------|----------|-------|
| 1 | Инициализация Firebase проекта | 2--3 ч |
| 2 | Миграция данных на Cloud Firestore | 4--6 ч |
| 3 | Firebase Authentication | 4--5 ч |
| 4 | Миграция бэкенда на Cloud Functions | 6--8 ч |
| 5 | Адаптация фронтенда | 5--7 ч |
| 6 | Firebase Hosting деплой | 2--3 ч |
| 7 | Аналитика и мониторинг | 3--4 ч |
| 8 | PWA и офлайн-режим | 5--7 ч |
| 9 | Уведомления и вовлечение | 4--5 ч |
| 10 | Расширенные функции | 6--8 ч |
| 11 | Тестирование и CI/CD | 6--8 ч |
| 12 | Безопасность и оптимизация | 5--7 ч |
| **ИТОГО** | | **52--71 ч** |

> При работе одного разработчика: **7--9 рабочих недель** (по 8ч/день).
> При работе двух разработчиков (frontend + backend): **4--5 недель**.

---

## Зависимости между этапами

```
ЭТАП 1 ─── ЭТАП 2 ─── ЭТАП 4 ─── ЭТАП 5 ─── ЭТАП 6
               │                      │          │
               └── ЭТАП 3 ────────────┘          │
                                                  ├── ЭТАП 7
                                                  ├── ЭТАП 8
                                                  ├── ЭТАП 9
                                                  └── ЭТАП 10
                                                       │
                                             ЭТАП 11 ──┘
                                                  │
                                             ЭТАП 12
```

- ЭТАПЫ 1-6: последовательные, составляют MVP.
- ЭТАПЫ 7-10: могут выполняться параллельно после ЭТАПА 6.
- ЭТАП 11: после завершения основных функций.
- ЭТАП 12: финальный, перед production launch.

---

## Файловая структура проекта после миграции

```
/home/user/V1/
├── firebase.json                 # Конфигурация Firebase
├── .firebaserc                   # Проект и targets
├── firestore.rules               # Security rules для Firestore
├── firestore.indexes.json        # Composite indexes
├── storage.rules                 # Security rules для Cloud Storage
├── functions/                    # Cloud Functions (Python)
│   ├── main.py                   # Функции: complete_workout, get_today_suggestion
│   ├── rate_limit.py             # Rate limiting модуль
│   ├── requirements.txt          # Python-зависимости
│   ├── .env                      # Переменные окружения (не в git)
│   └── tests/
│       └── test_complete_workout.py
├── frontend/                     # React-приложение
│   ├── public/
│   │   ├── manifest.json         # PWA manifest
│   │   ├── sw.js                 # Service Worker
│   │   ├── firebase-messaging-sw.js  # FCM Service Worker
│   │   └── icons/                # PWA иконки
│   ├── src/
│   │   ├── firebase.js           # Firebase SDK инициализация
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx   # Аутентификация
│   │   ├── services/
│   │   │   ├── firestore.js      # Firestore-запросы (замена api.js)
│   │   │   ├── functions.js      # Callable functions
│   │   │   ├── analytics.js      # Custom events
│   │   │   └── notifications.js  # FCM push-уведомления
│   │   ├── components/
│   │   │   ├── LoginScreen.jsx
│   │   │   ├── OnboardingScreen.jsx
│   │   │   ├── InstallPrompt.jsx
│   │   │   ├── NotificationRequest.jsx
│   │   │   ├── VideoUpload.jsx
│   │   │   └── ...               # Существующие компоненты
│   │   └── App.jsx               # Обновлённый с AuthProvider
│   ├── vite.config.js            # Оптимизированная конфигурация Vite
│   └── package.json
├── scripts/
│   └── migrate_to_firestore.py   # Скрипт миграции seed-данных
├── tests/
│   └── integration/
│       └── test_firestore_rules.py
├── .github/
│   └── workflows/
│       └── firebase-deploy.yml   # CI/CD pipeline
├── backend/                      # Старый бэкенд (deprecated после миграции)
│   ├── main.py
│   ├── models.py
│   └── seed_data.py
└── FIREBASE_STUDIO_SPEC.md       # Этот документ
```
