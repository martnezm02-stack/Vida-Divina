import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api.health import router as health_router
from .api.speak import router as speak_router
from .models.registry import get_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice_engine.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Cargando modelo al iniciar el servicio...")
    get_model()
    logger.info("Servicio listo.")
    yield


app = FastAPI(title="Vida Divina Voice Engine", version="0.1.0", lifespan=lifespan)

app.include_router(health_router)
app.include_router(speak_router)
