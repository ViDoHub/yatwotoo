FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install mongodump/mongorestore from standalone tools archive
# (avoids pulling the full mongo:7 image and its CVEs)
ARG MONGO_TOOLS_VERSION=100.12.0
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl libgssapi-krb5-2 && \
    curl -fsSL "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-debian12-x86_64-${MONGO_TOOLS_VERSION}.tgz" \
        -o /tmp/mongo-tools.tgz && \
    tar -xzf /tmp/mongo-tools.tgz --strip-components=2 -C /usr/bin/ \
        --wildcards '*/bin/mongodump' '*/bin/mongorestore' && \
    rm /tmp/mongo-tools.tgz && \
    apt-get purge -y curl && \
    apt-get autoremove -y && \
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
