import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

# A valid 64-char hex SHA-256 shadow ID for use across tests
VALID_SHADOW_ID = "a" * 64


@pytest.fixture
def mock_conn():
    """AsyncMock simulating an asyncpg connection."""
    conn = AsyncMock()
    conn.fetch.return_value = []
    conn.fetchrow.return_value = None
    conn.execute.return_value = None

    # conn.transaction() is called synchronously — return an async context manager
    tx = MagicMock()
    tx.__aenter__ = AsyncMock(return_value=None)
    tx.__aexit__ = AsyncMock(return_value=False)
    conn.transaction = MagicMock(return_value=tx)

    return conn


@pytest.fixture
def mock_pool(mock_conn):
    """AsyncMock simulating an asyncpg Pool."""
    pool = AsyncMock()
    pool.acquire.return_value = mock_conn
    pool.release.return_value = None
    return pool


@pytest_asyncio.fixture
async def client(mock_pool):
    """
    ASGI test client with the DB pool and lifespan hooks fully mocked.
    All tests share this fixture; the mock_conn is the single connection
    returned for every get_db() call.
    """
    with (
        patch("app.database.get_pool", new=AsyncMock(return_value=mock_pool)),
        patch("app.main.init_db", new=AsyncMock()),
        patch("app.main.close_pool", new=AsyncMock()),
    ):
        from app.main import app
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
