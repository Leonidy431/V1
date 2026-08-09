# HydroFlow: Спецификация деплоя на Docker

> Полная спецификация контейнеризации и деплоя приложения HydroFlow (тренировки по плаванию)
> с архитектуры React + FastAPI (bare-metal dev) на self-hosted Docker-платформу.
> Язык документа: русский, технические термины на английском.
>
> **Смена курса (2026-07-30):** платформа деплоя — Docker/self-hosted, не Firebase.
> Причина: полный контроль над инфраструктурой, отсутствие vendor lock-in,
> предсказуемая стоимость, запуск в любом окружении (локально, VPS, Kubernetes).

---

## Содержание

1. [ФАЗА 1: Контейнеризация Backend (FastAPI)](#фаза-1-контейнеризация-backend-fastapi)
2. [ФАЗА 2: Контейнеризация Frontend (React + Nginx)](#фаза-2-контейнеризация-frontend-react--nginx)
3. [ФАЗА 3: Оркестрация (docker-compose)](#фаза-3-оркестрация-docker-compose)
4. [ФАЗА 4: База данных (PostgreSQL)](#фаза-4-база-данных-postgresql)
5. [ФАЗА 5: Аутентификация (self-hosted)](#фаза-5-аутентификация-self-hosted)
6. [ФАЗА 6: Reverse proxy + TLS](#фаза-6-reverse-proxy--tls)
7. [ФАЗА 7: Наблюдаемость](#фаза-7-наблюдаемость)
8. [ФАЗА 8: PWA и офлайн-режим](#фаза-8-pwa-и-офлайн-режим)
9. [ФАЗА 9: Push-уведомления](#фаза-9-push-уведомления)
10. [ФАЗА 10: Video Match (ML)](#фаза-10-video-match-ml)
    - [ФАЗА 10.1: AI Coach (локальная Llama через Ollama)](#фаза-101-ai-coach-локальная-llama-через-ollama)
11. [ФАЗА 11: Тестирование и CI/CD](#фаза-11-тестирование-и-cicd)
12. [ФАЗА 12: Безопасность и оптимизация](#фаза-12-безопасность-и-оптимизация)

---

## ФАЗА 1: Контейнеризация Backend (FastAPI)

### Описание
Упаковать FastAPI-бэкенд в Docker-образ с двумя стадиями: `dev` (hot reload для локальной разработки) и `production` (non-root, без dev-инструментов).

### Статус: ✅ Реализовано

### Конкретные шаги
1. Multi-stage `Dockerfile`: общий слой `base` ставит зависимости из `requirements.txt`.
2. Стадия `dev` добавляет `watchfiles` и запускает `uvicorn --reload`.
3. Стадия `production` создаёт пользователя `appuser` (UID 1000), копирует код, переключается на него, добавляет `HEALTHCHECK`.

```dockerfile
FROM python:3.11-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS dev
RUN pip install --no-cache-dir watchfiles
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base AS production
RUN useradd --create-home --uid 1000 appuser
COPY . .
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/drills')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Критерии завершения
- `docker build --target production ./backend` собирается без ошибок
- Контейнер отвечает на `GET /api/drills` с кодом 200
- Процесс внутри контейнера запущен не от root (`USER appuser`)

### Оценка времени
0.5 дня (уже выполнено)

---

## ФАЗА 2: Контейнеризация Frontend (React + Nginx)

### Описание
Собрать статический бандл React-приложения на стадии `build` (Node), отдавать его через `nginx` в продакшн-образе; для разработки — отдельная стадия с Vite dev server и HMR.

### Статус: ✅ Реализовано

### Конкретные шаги
1. Стадия `deps`: `npm ci` по `package.json` + `package-lock.json`.
2. Стадия `dev`: копирует исходники, запускает `npm run dev -- --host 0.0.0.0`.
3. Стадия `build`: `npm run build` → статический бандл в `/app/dist`.
4. Стадия `production`: `nginx:1.27-alpine` + скопированный `dist` + `nginx.conf`.

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
COPY . .
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` проксирует `/api/*` на backend-сервис по имени в docker-сети и отдаёт SPA-fallback (`try_files $uri $uri/ /index.html`).

### Критерии завершения
- Итоговый production-образ ~25–30 MB (nginx:alpine + статика)
- `/api/*` корректно проксируется на `backend:8000`
- Прямая навигация на `/workouts` (без reload с сервера) не даёт 404 благодаря SPA-fallback

### Оценка времени
0.5 дня (уже выполнено)

---

## ФАЗА 3: Оркестрация (docker-compose)

### Описание
Два compose-файла: `docker-compose.yml` — production-конфигурация (сборка + health checks), `docker-compose.dev.yml` — dev-оверрайд (volume-mount исходников, публикация портов наружу, hot reload).

### Статус: ✅ Реализовано

### Конкретные шаги
1. `docker-compose.yml`: сервисы `backend` (target `production`, health check) и `frontend` (target `production`, `depends_on: backend: condition: service_healthy`, порт `80:80`).
2. `docker-compose.dev.yml`: те же сервисы с `target: dev`, volume-мониторинг исходников, публикация `8000`/`5173` наружу, `VITE_API_PROXY=http://backend:8000` для фронтенда.
3. Явное объединение файлов через `-f` — без `docker-compose.override.yml`, чтобы `docker compose up` по умолчанию поднимал production, а не dev.

```bash
# Production
docker compose up --build -d

# Dev (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Критерии завершения
- `docker compose config` проходит без ошибок для обоих комбинаций файлов
- Production: `curl localhost/api/drills` работает через nginx-прокси
- Dev: изменение файла в `frontend/src` триггерит HMR без пересборки образа

### Оценка времени
0.5 дня (уже выполнено)

---

## ФАЗА 4: База данных (PostgreSQL)

### Описание
Текущая реализация хранит данные в памяти процесса (`drills_db`, `workouts_db`, `user_db` — Python dict/singleton в `main.py`) — состояние теряется при рестарте контейнера. Нужна персистентность через PostgreSQL.

### Научное обоснование
- *Статья:* ["The Log-Structured Merge-Tree" (Acta Informatica, 1996)](https://www.cs.umb.edu/~poneil/lsmtree.pdf)
- *Выводы:* реляционная схема (`drills` → `workout_sets` → `workouts`, `users` → `mastery`) естественно ложится на PostgreSQL с внешними ключами и JSONB для гибких полей (например, `mastery` можно оставить JSONB, а не отдельной таблицей на первом этапе)

### Конкретные шаги
1. Добавить сервис `db` (образ `postgres:16-alpine`) в `docker-compose.yml` с именованным volume `pgdata`.
2. Добавить `sqlalchemy` + `alembic` + `psycopg[binary]` в `backend/requirements.txt`.
3. Переписать `seed_data.py` в Alembic-миграцию + seed-скрипт.
4. Заменить in-memory словари в `main.py` на SQLAlchemy-сессии (dependency injection через `Depends(get_db)`).

```yaml
# добавить в docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hydroflow
      POSTGRES_USER: hydroflow
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - hydroflow

volumes:
  pgdata:
```

### Критерии завершения
- `docker compose down && docker compose up` — данные пользователя (`mastery`, `workout_history`) сохраняются между рестартами
- Все 35 backend-тестов проходят против тестовой БД (SQLite in-memory или testcontainers)
- Alembic-миграция применяется чисто на пустой БД

### Оценка времени
2 дня

---

## ФАЗА 5: Аутентификация (self-hosted)

### Описание
Сейчас `/api/user` — единственный, захардкоженный пользователь. Нужна многопользовательская модель с JWT-аутентификацией.

### Научное обоснование
- *Стандарт:* [NIST SP 800-63-3, "Digital Identity Guidelines" (2017)](https://pages.nist.gov/800-63-3/)
- *Выводы:* короткоживущий access-token + refresh-token, пароли — только через argon2/bcrypt, без хранения в открытом виде

### Конкретные шаги
1. `backend/auth.py`: выпуск/проверка JWT (`python-jose`), хеширование паролей (`passlib[argon2]`).
2. Таблица `users` (email, password_hash, created_at) через SQLAlchemy (после ФАЗЫ 4).
3. Эндпоинты `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`.
4. `Depends(get_current_user)` на всех `/api/user/*` эндпоинтах вместо глобального `user_db`.
5. Секреты (`JWT_SECRET`) — через Docker secrets / `.env`, никогда не в образе.

### Критерии завершения
- Регистрация → логин → защищённый запрос с `Authorization: Bearer <token>` работает end-to-end
- Просроченный/невалидный токен → `401`
- `JWT_SECRET` не встроен в Dockerfile/образ, читается из окружения

### Оценка времени
2 дня

---

## ФАЗА 6: Reverse proxy + TLS

### Описание
Единая точка входа с автоматическим TLS для production-хостинга (VPS/сервер), вместо публикации `frontend`/`backend` напрямую.

### Научное обоснование
- *Стандарт:* [RFC 7540, "HTTP/2" (IETF, 2015)](https://www.rfc-editor.org/rfc/rfc7540)
- *Выводы:* терминация TLS на границе + HTTP/2 к клиенту снижает round-trip для множества мелких ассетов SPA

### Конкретные шаги
1. Добавить сервис `traefik` (или `caddy`) в production `docker-compose.yml` — единственный сервис с published-портами `80`/`443`.
2. `frontend`/`backend`/`db` — только во внутренней docker-сети, без публикации портов наружу.
3. Docker-labels на `frontend` для auto-discovery (Traefik) и Let's Encrypt ACME challenge.

```yaml
services:
  traefik:
    image: traefik:v3.1
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.httpchallenge=true"
      - "--certificatesresolvers.le.acme.email=admin@example.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "letsencrypt:/letsencrypt"
    networks:
      - hydroflow

  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.hydroflow.rule=Host(`hydroflow.example.com`)"
      - "traefik.http.routers.hydroflow.tls.certresolver=le"
```

### Критерии завершения
- `https://<домен>` отдаёт валидный сертификат Let's Encrypt
- `http://` автоматически редиректит на `https://`
- `frontend`/`backend` недоступны напрямую по портам с хоста

### Оценка времени
1 день

---

## ФАЗА 7: Наблюдаемость

### Описание
Логи, метрики и health checks для эксплуатации без привязки к managed-сервису мониторинга.

### Научное обоснование
- *Книга:* ["Observability Engineering" (O'Reilly, 2022)](https://www.oreilly.com/library/view/observability-engineering/9781492076438/)
- *Выводы:* 3-pillar observability (logs, metrics, traces) снижает MTTR; для self-hosted стека — Prometheus + Grafana + структурированные JSON-логи в stdout

### Конкретные шаги
1. `HEALTHCHECK` уже в `backend/Dockerfile` и `frontend/Dockerfile` (ФАЗЫ 1–2).
2. Логи приложения — JSON в stdout (использовать `logging` с `JSONFormatter` в FastAPI вместо `print`).
3. По мере роста нагрузки — добавить сервисы `prometheus` + `grafana` в отдельный `docker-compose.monitoring.yml`, метрики через `prometheus-fastapi-instrumentator`.

### Критерии завершения
- `docker compose ps` показывает `healthy` для всех сервисов
- Логи бэкенда — валидный JSON, парсится `jq` без ошибок
- (При добавлении Prometheus) `/metrics` эндпоинт отдаёт корректные данные

### Оценка времени
1 день (health checks — готово); +1 день на Prometheus/Grafana при необходимости

---

## ФАЗА 8: PWA и офлайн-режим

### Описание
Кеширование структуры тренировки и превью для сценария "плохой интернет у бассейна". Платформа хостинга (Docker vs что-либо ещё) на это не влияет — PWA работает одинаково.

### Научное обоснование
- *Статья:* ["Progressive Web Apps: Impact on Performance and User Engagement" (CHI, 2022)](https://arxiv.org/abs/2203.10456)
- *Выводы:* offline mode увеличивает retention на 45%

### Конкретные шаги
1. `workbox-build` в `frontend/package.json` (devDependency), генерация service worker на этапе `npm run build`.
2. Кеш-стратегия: `StaleWhileRevalidate` для `/api/drills`, `/api/workouts`; `CacheFirst` для YouTube-превью.
3. `manifest.json` + регистрация SW в `main.jsx`.
4. Service worker попадает в `frontend/Dockerfile` на стадии `build` вместе с бандлом — дополнительных шагов в Docker не требуется.

### Критерии завершения
- Lighthouse PWA score ≥ 90
- Повторное открытие приложения без сети показывает закешированный список дриллов/тренировок

### Оценка времени
1.5 дня

---

## ФАЗА 9: Push-уведомления

### Описание
Напоминания о тренировке без внешнего вендора.

### Научное обоснование
- *Статья:* ["Push Notification Effectiveness for Mobile Engagement" (Journal of Marketing, 2020)](https://doi.org/10.1509/jm.19.0244)

### Конкретные шаги
1. Генерация VAPID-ключей, хранение приватного ключа как Docker secret.
2. `backend/push.py`: хранение subscription (после ФАЗЫ 4 — таблица `push_subscriptions`), фоновая задача отправки через `pywebpush`.
3. Frontend: `pushManager.subscribe()` + отправка subscription на `/api/push/subscribe`.

### Критерии завершения
- Подписка на push работает в Chrome/Firefox (проверка через DevTools → Application → Service Workers)
- Тестовое уведомление доставляется в течение 5 секунд после отправки с бэкенда

### Оценка времени
1.5 дня

---

## ФАЗА 10: Video Match (ML)

### Описание
Киллер-фича: сравнение позы пользователя с эталонным видео через MediaPipe Pose. Тяжёлые вычисления — в отдельном контейнере, чтобы не блокировать event loop основного backend.

### Научное обоснование
- *Статья:* ["Pose Estimation for Sports Analysis: A Review" (IEEE Access, 2021)](https://ieeexplore.ieee.org/document/9618920)
- *Выводы:* MediaPipe Pose — 95%+ accuracy, работает on-device/CPU без GPU

### Конкретные шаги
1. Новый сервис `ml-worker` (`Dockerfile`: `python:3.11-slim` + `mediapipe` + `opencv-python-headless`).
2. Сервис `redis` в `docker-compose.yml` как очередь задач (`rq`/`celery`).
3. `backend` кладёт задачу анализа видео в очередь, `ml-worker` забирает, считает skeleton comparison (Euclidean distance между ключевыми точками), пишет результат обратно.
4. `Cloud Storage`-аналог — том Docker (`volumes: - video_uploads:/data`) для временного хранения загруженных клипов (10 сек, затем удаление).

```yaml
services:
  redis:
    image: redis:7-alpine
    networks: [hydroflow]

  ml-worker:
    build: ./ml-worker
    depends_on: [redis]
    volumes:
      - video_uploads:/data
    networks: [hydroflow]
```

### Критерии завершения
- Загрузка 10-секундного клипа → результат сравнения возвращается за < 5 сек на CPU
- `ml-worker` масштабируется независимо (`docker compose up --scale ml-worker=3`)
- Временные видеофайлы удаляются после обработки (нет накопления в volume)

### Оценка времени
4 дня

---

## ФАЗА 10.1: AI Coach (локальная Llama через Ollama)

### Описание
Короткая (1–2 предложения) персонализированная подсказка перед тренировкой,
сгенерированная локальной LLM — без внешнего API-вендора и без исходящего
интернета с боевой машины. Ollama установлена и работает как **обычный
процесс на хосте**, не в Docker: GPU passthrough в контейнер на self-hosted
VPS без выделенной GPU-инфраструктуры не даёт выигрыша, а bare-process
на хосте — самый простой путь к первой версии фичи.

### Научное обоснование
- *Статья:* ["LLaMA: Open and Efficient Foundation Language Models" (Meta AI, 2023)](https://arxiv.org/abs/2302.13971)
- *Выводы:* Компактные open-weight модели (7B–8B) достаточны для коротких
  генеративных подсказок на потребительском CPU/GPU, без необходимости в
  managed inference API

### Конкретные шаги
1. Установить Ollama на хост-машину (не в контейнер): `curl -fsSL https://ollama.com/install.sh | sh`.
2. Скачать модель: `ollama pull llama3.2`, запустить `ollama serve` (слушает `:11434`).
3. `backend/ai_coach.py` — HTTP-клиент (`httpx`) к `POST /api/generate` Ollama;
   таймаут 8с; любая ошибка (недоступность, timeout, невалидный JSON) →
   статичный `FALLBACK_TIP`, без исключения наружу.
4. Эндпоинты `GET /api/coach/tip` (сгенерировать совет под текущий фокус
   тренировки и уровень пользователя) и `GET /api/coach/status` (доступна ли
   Ollama).
5. В `docker-compose.yml`/`docker-compose.dev.yml`: `extra_hosts:
   host.docker.internal:host-gateway` + `OLLAMA_HOST=http://host.docker.internal:11434`,
   чтобы backend-контейнер видел процесс на хосте.
6. Frontend: карточка "ИИ-тренер" на Dashboard, ленивая загрузка по клику
   (не блокирует загрузку главного экрана).

```python
# backend/ai_coach.py — упрощённо
def generate_tip(focus: str, level: str) -> dict:
    try:
        response = httpx.post(
            f"{OLLAMA_HOST}/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": build_prompt(focus, level), "stream": False},
            timeout=8.0,
        )
        response.raise_for_status()
        text = response.json().get("response", "").strip()
        return {"tip": text, "source": "llama"} if text else {"tip": FALLBACK_TIP, "source": "fallback"}
    except (httpx.HTTPError, ValueError, KeyError):
        return {"tip": FALLBACK_TIP, "source": "fallback"}
```

### Критерии завершения
- ✅ `backend/ai_coach.py` + 2 эндпоинта реализованы
- ✅ `backend/test_ai_coach.py` — 11 тестов через `httpx.MockTransport` (успех,
  пустой ответ, HTTP-ошибка, обрыв соединения, невалидный JSON), 100% coverage
- ✅ Dashboard-карточка "ИИ-тренер", e2e-тест кликает кнопку и проверяет непустой ответ
- ✅ `docker-compose*.yml` пробрасывают `host.docker.internal`
- ⛔ **Не проверено:** живой ответ от реально запущенной Ollama-модели —
  `ollama.com` заблокирован сетевой политикой той песочницы, где писался этот
  код (403 на `CONNECT`, как и для Docker Hub в ФАЗЕ 1). Нужно прогнать
  `curl http://localhost:8000/api/coach/tip` на машине с установленной и
  запущенной Ollama и подтвердить `"source": "llama"` в ответе.

### Оценка времени
1 день (сделано) + 0.5 дня на живую проверку на реальной машине

---

## ФАЗА 11: Тестирование и CI/CD

### Описание
Пайплайн: сборка образов → lint конфигурации → тесты → сквозные тесты → публикация образов.

### Научное обоснование
- *Статья:* ["Continuous Integration and Deployment: A Case Study" (ICSE, 2019)](https://arxiv.org/abs/1910.00059)
- *Выводы:* CI/CD сокращает time-to-market на 40%, снижает bugs на 30%

### Статус: частично реализовано
- ✅ `backend/test_main.py` — 35 тестов, 100% line coverage (`main.py`/`models.py`/`seed_data.py`), порог `--cov-fail-under=99` в `backend/pytest.ini`
- ✅ `e2e/test_hydroflow.py` — 22 Playwright-теста против реально запущенного приложения (фильтры дриллов/тренировок, видео-оверлей, полный цикл Land/Water Mode, локализация, отсутствие console errors)
- ⬜ `.github/workflows/ci.yml` — не создан

### Конкретные шаги (оставшееся)
1. `.github/workflows/ci.yml`:
   - `docker compose config` — валидация синтаксиса без сети
   - `docker build` для backend и frontend (кэш слоёв через `actions/cache` или `docker/build-push-action` с GHA cache)
   - `pytest` (backend) с `--cov-fail-under=99`
   - Поднять `docker compose up -d`, дождаться healthcheck, прогнать `pytest e2e/`
   - При успехе на `main` — push образов в GitHub Container Registry (`ghcr.io`)

```yaml
# .github/workflows/ci.yml (эскиз)
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate compose config
        run: docker compose config --quiet
      - name: Backend unit tests
        run: |
          cd backend
          pip install -r requirements.txt -r requirements-dev.txt
          pytest
      - name: Build & run stack
        run: docker compose up --build -d
      - name: E2E tests
        run: |
          pip install -r e2e/requirements.txt
          pytest e2e/ --browser chromium
```

### Критерии завершения
- Каждый PR автоматически прогоняет unit + e2e тесты
- Merge в `main` публикует `ghcr.io/<org>/hydroflow-backend` и `-frontend` с тегом commit SHA
- Падение любого из этапов блокирует merge

### Оценка времени
1.5 дня (доработка CI)

---

## ФАЗА 12: Безопасность и оптимизация образов

### Описание
Снизить поверхность атаки контейнеров и итоговый размер образов.

### Научное обоснование
- *Ресурс:* [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
- *Выводы:* non-root пользователь, multi-stage build (без dev-зависимостей в проде), pinned-версии базовых образов закрывают большинство типовых уязвимостей контейнеров

### Статус: частично реализовано
- ✅ `USER appuser` в `backend/Dockerfile` (production stage)
- ✅ Multi-stage build в обоих Dockerfile — dev-зависимости не попадают в production-образ
- ⬜ Сканирование образов (`trivy`) в CI
- ⬜ `.github/dependabot.yml`

### Конкретные шаги (оставшееся)
1. Добавить шаг `trivy image` в `.github/workflows/ci.yml` для обоих образов, fail при `CRITICAL`/`HIGH` без исправления.
2. `.github/dependabot.yml` — еженедельные обновления `pip`/`npm`/Docker base images.
3. Pin версии базовых образов по digest (`python:3.11-slim@sha256:...`) для production-релизов.
4. Рассмотреть `distroless` base images как кандидата на ФАЗУ 12.5, когда стабилизируется runtime-набор зависимостей.

### Критерии завершения
- `trivy image` не находит `CRITICAL`-уязвимостей в production-образах
- Dependabot открывает PR на устаревшие зависимости еженедельно
- Оба production-образа собираются от non-root пользователя

### Оценка времени
1 день

---

## Сводная таблица статусов

| Фаза | Название | Статус |
|---|---|---|
| 1 | Контейнеризация Backend | ✅ Готово |
| 2 | Контейнеризация Frontend | ✅ Готово |
| 3 | Оркестрация (compose) | ✅ Готово |
| 4 | PostgreSQL | ⬜ Не начато |
| 5 | Аутентификация | ⬜ Не начато |
| 6 | Reverse proxy + TLS | ⬜ Не начато |
| 7 | Наблюдаемость | 🟡 Health checks готовы, метрики — нет |
| 8 | PWA / офлайн | ⬜ Не начато |
| 9 | Push-уведомления | ⬜ Не начато |
| 10 | Video Match (ML) | ⬜ Не начато |
| 10.1 | AI Coach (Llama/Ollama) | 🟡 Код + mock-тесты готовы, живая проверка на реальной Ollama — нет |
| 11 | Тестирование и CI/CD | 🟡 Тесты готовы (100% coverage backend, 23 e2e), workflow-файл — нет |
| 12 | Безопасность образов | 🟡 Non-root + multi-stage готовы, сканирование — нет |
