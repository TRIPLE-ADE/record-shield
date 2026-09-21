from fastapi import APIRouter

from app.api.v1.routes import (
    admin,
    auth,
    downtime,
    emergency,
    exchange,
    health,
    local_workspace,
    m1_probe,
    patients,
    portal,
    security,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(m1_probe.router)
api_router.include_router(auth.router)
api_router.include_router(local_workspace.router)
api_router.include_router(patients.router)
api_router.include_router(exchange.router)
api_router.include_router(portal.router)
api_router.include_router(emergency.router)
api_router.include_router(security.router)
api_router.include_router(admin.router)
api_router.include_router(downtime.router)
