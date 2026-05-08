from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def iter_bytes(total_bytes: int, chunk_size: int = 256 * 1024):
    remaining = total_bytes
    chunk = b"0" * min(chunk_size, total_bytes)
    while remaining > 0:
        if remaining < len(chunk):
            yield b"0" * remaining
        else:
            yield chunk
        remaining -= len(chunk)


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/ping")
def ping():
    return {"server_time": time.time()}


@app.get("/api/download")
def download(size: int = 10 * 1024 * 1024):
    capped = max(1, min(size, MAX_DOWNLOAD_BYTES))
    headers = {
        "Cache-Control": "no-store",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "identity",
        "X-Content-Size": str(capped),
    }
    return StreamingResponse(iter_bytes(capped), headers=headers)


@app.post("/api/upload")
async def upload(request: Request):
    received = 0
    async for chunk in request.stream():
        received += len(chunk)
        if received > MAX_UPLOAD_BYTES:
            break
    return {"received_bytes": received}