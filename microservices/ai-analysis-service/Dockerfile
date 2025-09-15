# Multi-stage Docker build for AI Analysis Service
FROM python:3.13-slim as base

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN set -eux; \
    apt-get update; \
    # Note: libatlas-base-dev is not available on Debian trixie; use libatlas3-base + libopenblas-dev instead
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential \
      libglib2.0-0 \
      libsm6 \
      libxext6 \
      libxrender-dev \
      libgomp1 \
      libgtk-3-0 \
      libgl1 \
      libavcodec-dev \
      libavformat-dev \
      libswscale-dev \
      libv4l-dev \
      libxvidcore-dev \
      libx264-dev \
      libjpeg-dev \
      libpng-dev \
      libtiff-dev \
      libopenblas-dev \
      libatlas3-base \
      gfortran \
      wget \
      curl; \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
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
