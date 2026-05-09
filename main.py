from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import ipaddress
import os
import time

import httpx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = FastAPI()
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

templates = Jinja2Templates(directory=TEMPLATES_DIR)

MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

WHOIS_CACHE_TTL = 60 * 60
_whois_cache: dict[str, tuple[float, dict]] = {}


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


def _client_ip(request: Request) -> str:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _is_public_ip(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved)


def _parse_as_number(as_field: str) -> int | None:
    if not as_field.startswith("AS"):
        return None
    head = as_field.split(" ", 1)[0][2:]
    return int(head) if head.isdigit() else None


async def _lookup_ip(ip: str) -> dict:
    cached = _whois_cache.get(ip)
    if cached and time.time() - cached[0] < WHOIS_CACHE_TTL:
        return cached[1]

    params = {"fields": "status,country,city,isp,org,as,asname,query"}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}", params=params)
            data = resp.json()
    except Exception:
        return {"ip": ip}

    if data.get("status") != "success":
        result: dict = {"ip": ip}
    else:
        as_field = data.get("as") or ""
        result = {
            "ip": data.get("query") or ip,
            "country": data.get("country"),
            "city": data.get("city"),
            "isp": data.get("isp"),
            "org": data.get("org"),
            "as": as_field,
            "as_number": _parse_as_number(as_field),
            "asname": data.get("asname"),
        }
    _whois_cache[ip] = (time.time(), result)
    return result


@app.get("/api/whoami")
async def whoami(request: Request):
    ip = _client_ip(request)
    if not ip or not _is_public_ip(ip):
        return {"ip": ip, "private": True}
    return await _lookup_ip(ip)