from fastapi import FastAPI
from typing import List

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
