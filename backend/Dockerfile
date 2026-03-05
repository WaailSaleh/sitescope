FROM python:3.11-slim AS base

# Security: create non-root user
RUN groupadd -r sitescope && useradd -r -g sitescope -d /app -s /sbin/nologin sitescope

WORKDIR /app

# Install deps as root (need write access), then lock down
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip cache purge

# Copy application code
COPY app/ ./app/

# Create data directory with correct ownership
RUN mkdir -p /app/data && chown -R sitescope:sitescope /app

# Drop to non-root
USER sitescope

# Expose app port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-access-log"]
