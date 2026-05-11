FROM mongo:7 AS mongo-tools

FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy mongodump/mongorestore from the official mongo image
COPY --from=mongo-tools /usr/bin/mongodump /usr/bin/mongorestore /usr/bin/

# Install shared libs needed by mongo tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgssapi-krb5-2 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Install dependencies first (cached layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code
COPY app/ app/

# Entrypoint: auto-restore DB from backup on first run
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8000

ENV PORT=8000

ENTRYPOINT ["/entrypoint.sh"]
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0"]
