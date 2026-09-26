# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f backend/Dockerfile .
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY backend ./backend
# FastF1 downloads go to /app/cache; mount a volume there so they survive restarts.
RUN useradd --create-home app && mkdir -p cache && chown app cache
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"
# One worker: loaded sessions are cached in process memory and loads are
# de-duplicated per process, so extra workers would multiply memory use.
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
