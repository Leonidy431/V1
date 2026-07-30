FROM python:3.11-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# dev — hot reload, source mounted as a volume by docker-compose.dev.yml
# ---------------------------------------------------------------------------
FROM base AS dev
RUN pip install --no-cache-dir watchfiles
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---------------------------------------------------------------------------
# production — runs as non-root, no reload
# ---------------------------------------------------------------------------
FROM base AS production
RUN useradd --create-home --uid 1000 appuser
COPY . .
USER appuser
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/drills')" || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
