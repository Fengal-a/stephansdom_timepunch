from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import router as users_router
from .routers import auth_router
from .routers import admin_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TimePunch API",
    description="Time punching backend for workforce clock-in/out",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://192.168.18.8:5173", "http://10.9.22.181:5173",
                   "http://172.20.10.2:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_router)

@app.get("/")
async def root():
    return {"message": "TimePunch API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

