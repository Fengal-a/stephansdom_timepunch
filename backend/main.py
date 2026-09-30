from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .database import engine, Base
from .routers import router as users_router
from .routers import auth_router
from .routers import admin_router
from .routers import messages_router
from .routers import calendar_router
from .routers.auth import limiter

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TimePunch API",
    description="Time punching backend for workforce clock-in/out",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Note: there is deliberately no network-wide IP restriction here. Logging in and
# viewing your own data works from anywhere; only punching is limited to the
# office WLAN, enforced per-request in routers/time_entries.py.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://domstempel.at"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(messages_router)
app.include_router(calendar_router)


@app.get("/")
async def root():
    return {"message": "TimePunch API is running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
