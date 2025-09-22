# Multi-stage Docker build for AI Analysis Service
FROM python:3.13-slim AS base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install minimal system dependencies
RUN set -eux; \
    apt-get update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential \
      libjpeg-dev \
      libpng-dev \
      libgl1 \
      libglib2.0-0 \
      ffmpeg \
      libsndfile1 \
      tesseract-ocr \
      tesseract-ocr-eng \
      wget \
      curl; \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy lightweight requirements first for better caching
COPY requirements-light.txt requirements.txt

# Install Python dependencies (lightweight version)
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/models /tmp/ai-analysis /app/logs

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app /tmp/ai-analysis
USER appuser

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the application
CMD ["python", "main.py"]
