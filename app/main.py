import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routes.api import router as api_router
from app.routes.pages import router as pages_router
from app.routes.searches import router as searches_router


def _build_log_handler() -> logging.Handler:
    """Return a stderr handler with JSON or text formatting based on config."""
    handler: logging.StreamHandler = logging.StreamHandler()  # type: ignore[type-arg]
    if settings.log_format == 'json':
        from pythonjsonlogger.json import JsonFormatter

        handler.setFormatter(fmt=JsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s'))
    else:
        handler.setFormatter(fmt=logging.Formatter(fmt='%(asctime)s [%(levelname)s] %(name)s: %(message)s'))
    return handler


logging.basicConfig(
    level=logging.INFO,
    handlers=[_build_log_handler()],
)
logger: logging.Logger = logging.getLogger(name=__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = await init_db()
    app.state.started_at = datetime.now(tz=UTC)
    app.state.motor_client = client

    yield

    client.close()


app = FastAPI(title='Yad2 Search', lifespan=lifespan)

app.mount(path='/static', app=StaticFiles(directory='app/static'), name='static')

app.include_router(router=pages_router)
app.include_router(router=searches_router)
app.include_router(router=api_router)


@app.get(path='/health')
async def health() -> JSONResponse:
    """Return service health: DB connectivity and uptime."""
    status: str = 'ok'
    db_ok: bool = False

    try:
        result: dict[str, Any] = await app.state.motor_client[settings.mongodb_db].command('ping')
        db_ok: Any | bool = result.get('ok') == 1
    except Exception:
        status = 'degraded'

    uptime_seconds: float = (datetime.now(tz=UTC) - app.state.started_at).total_seconds()

    return JSONResponse(
        content={
            'status': status,
            'db': 'connected' if db_ok else 'unreachable',
            'uptime_seconds': round(number=uptime_seconds, ndigits=1),
        },
    )
