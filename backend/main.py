import os
import ipaddress
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import jwt

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .database import engine, Base
from .routers import router as users_router
from .routers import auth_router
from .routers import admin_router
from .routers import messages_router
from .routers.auth import SECRET_KEY, ALGORITHM, limiter

Base.metadata.create_all(bind=engine)

# Comma-separated list of allowed subnets/IPs for non-admin access.
# Example: "192.168.1.0/24" or "192.168.1.0/24,10.0.0.0/8"
# Leave empty to disable the restriction (e.g. during local development).
OFFICE_NETWORKS_RAW = os.environ.get("OFFICE_NETWORKS", "")
OFFICE_NETWORKS = []
for net in OFFICE_NETWORKS_RAW.split(","):
    net = net.strip()
    if net:
        try:
            OFFICE_NETWORKS.append(ipaddress.ip_network(net, strict=False))
        except ValueError:
            pass  # ignore malformed entries on startup


def is_office_ip(ip: str) -> bool:
    """Return True if the IP is within one of the configured office networks."""
    if not OFFICE_NETWORKS:
        return True  # restriction disabled — allow all
    try:
        addr = ipaddress.ip_address(ip)
        return any(addr in net for net in OFFICE_NETWORKS)
    except ValueError:
        return False


def is_admin_token(token: str) -> bool:
    """Decode the JWT and return True if the user is an admin."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return bool(payload.get("is_admin", False))
    except Exception:
        return False


app = FastAPI(
    title="TimePunch API",
    description="Time punching backend for workforce clock-in/out",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.middleware("http")
async def office_network_restriction(request: Request, call_next):
    """
    Block non-admin access from outside the office network.
    - Requests from office IPs: always allowed.
    - Requests from outside with a valid admin token: allowed.
    - Requests from outside without a token (e.g. the login page itself):
      blocked with 403 so employees can't even reach the login form.
    - Exception: /health is always allowed for uptime checks.
    """
    if not OFFICE_NETWORKS:
        return await call_next(request)  # restriction disabled

    # Always allow health checks
    if request.url.path == "/health":
        return await call_next(request)

    # Get the real client IP (respects X-Forwarded-For from nginx)
    forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else request.client.host

    if is_office_ip(client_ip):
        return await call_next(request)

    # Outside office — only allow if a valid admin token is present
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if token and is_admin_token(token):
        return await call_next(request)

    return JSONResponse(
        status_code=403,
        content={"detail": "Zugriff nur im Sakristeinetzwerk erlaubt."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://stephansdom.at"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(messages_router)

@app.get("/")
async def root():
    return {"message": "TimePunch API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

