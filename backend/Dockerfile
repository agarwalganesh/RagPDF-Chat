# ── Backend Dockerfile ──────────────────────────────────────────────
FROM python:3.10-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies required for:
#   - build-essential: compiling C extensions (faiss-cpu, numpy, etc.)
#   - curl: health-check probes
#   - libgomp1: OpenMP runtime needed by FAISS at runtime
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        libgomp1 && \
    rm -rf /var/lib/apt/lists/*

# Install torch CPU-only FIRST (avoids pulling 554MB CUDA build via sentence-transformers)
# --index-url = primary (CPU wheels), --extra-index-url = fallback for build deps (flit_core etc.)
COPY requirements.txt .
RUN pip install --no-cache-dir \
        --index-url https://download.pytorch.org/whl/cpu \
        --extra-index-url https://pypi.org/simple \
        torch

# Install the rest of the requirements (sentence-transformers will reuse the CPU torch)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source code
COPY . .

# Ensure the persistent data directory exists inside the image
RUN mkdir -p /app/data

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
