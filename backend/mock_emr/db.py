from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from mock_emr.config import settings
from mock_emr.models import VendorBase
from mock_emr.seed import seed

engine = create_async_engine(settings.mercy_emr_database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init() -> None:
    """Fixture-managed vendor schema: create tables and seed on first start. No Alembic."""
    async with engine.begin() as connection:
        await connection.run_sync(VendorBase.metadata.create_all)
    async with SessionLocal() as session:
        await seed(session)
