from fastapi import APIRouter

from app.api.v1.routes import auth, exchange, health, local_workspace, m1_probe

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(m1_probe.router)
api_router.include_router(auth.router)
api_router.include_router(local_workspace.router)
api_router.include_router(exchange.router)
