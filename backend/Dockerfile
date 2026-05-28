FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev fonts-dejavu-core fonts-dejavu-extra \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads

EXPOSE 8000
# SHELL forma (nie JSON array) — Railway expanduje $PORT len v shell forme
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
