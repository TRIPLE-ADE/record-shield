from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from audit_service.config import settings
from audit_service.models import AuditBase

engine = create_async_engine(f"sqlite+aiosqlite:///{settings.audit_database_path}")
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


async def init() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(AuditBase.metadata.create_all)
