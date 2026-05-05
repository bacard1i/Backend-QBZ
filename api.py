import os
import time
import hashlib
from contextlib import asynccontextmanager

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

QOBUZ_BASE_URL = "https://www.qobuz.com/api.json/0.2"
APP_ID = os.getenv("QOBUZ_APP_ID")
APP_SECRET = os.getenv("QOBUZ_APP_SECRET")
USER_AUTH_TOKEN = os.getenv("QOBUZ_USER_AUTH_TOKEN")
COUNTRY_CODE = os.getenv("COUNTRY_CODE", "PT")

@asynccontextmanager
async def lifespan(app):
    client = httpx.AsyncClient(timeout=15.0)
    app.state.http_client = client
    print("🚀 Qobuz Backend started successfully")
    yield
    await client.aclose()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

async def qobuz_get(endpoint, params=None):
    if not APP_ID or not USER_AUTH_TOKEN:
        raise HTTPException(500, "Missing credentials")
    url = f"{QOBUZ_BASE_URL}/{endpoint.lstrip('/')}"
    headers = {"X-App-Id": APP_ID, "X-User-Auth-Token": USER_AUTH_TOKEN}
    client = app.state.http_client
    r = await client.get(url, headers=headers, params=params or {})
    r.raise_for_status()
    return r.json()

def is_hires(t):
    return (t.get("maximum_bit_depth") or 0) >= 24 or (t.get("bit_depth") or 0) >= 24

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/8spine/search")
async def search(q: str = Query(...), limit: int = 25):
    data = await qobuz_get("track/search", {"query": q, "limit": min(limit*2, 100), "country_code": COUNTRY_CODE})
    items = data.get("tracks", {}).get("items", [])
    filtered = [t for t in items if is_hires(t)][:limit]
    tracks = [{
        "id": str(t["id"]),
        "title": t["title"],
        "artist": t.get("performer", {}).get("name", "Unknown"),
        "album": t.get("album", {}).get("title", ""),
        "albumId": str(t.get("album", {}).get("id", "")),
        "duration": t.get("duration", 0),
        "audioQuality": "24-bit Hi-Res",
        "cover": t.get("album", {}).get("image", {}).get("large")
    } for t in filtered]
    return {"tracks": tracks, "total": len(tracks)}

@app.get("/8spine/stream/{track_id}")
async def stream(track_id: int):
    if not APP_SECRET:
        raise HTTPException(500, "APP_SECRET missing")
    ts = int(time.time())
    sig = hashlib.md5(f"trackgetFileUrlformat_id27intentstreamtrack_id{track_id}{ts}{APP_SECRET}".encode()).hexdigest()
    params = {"track_id": track_id, "format_id": 27, "intent": "stream", "request_ts": ts, "request_sig": sig}
    data = await qobuz_get("track/getFileUrl", params)
    if not data.get("url"):
        raise HTTPException(404, "No stream URL")
    return {"streamUrl": data["url"], "quality": "24-bit Hi-Res"}

@app.get("/8spine/album")
async def album(album_id: str = Query(...)):
    data = await qobuz_get("album/get", {"album_id": album_id, "limit": 100, "country_code": COUNTRY_CODE})
    tracks = [t for t in data.get("tracks", {}).get("items", []) if is_hires(t)]
    return {
        "album": {"id": album_id, "title": data.get("title"), "artist": data.get("artist", {}).get("name")},
        "tracks": [{
            "id": str(t["id"]),
            "title": t["title"],
            "artist": t.get("performer", {}).get("name") or data.get("artist", {}).get("name"),
            "duration": t.get("duration"),
            "trackNumber": t.get("track_number"),
            "audioQuality": "24-bit Hi-Res"
        } for t in tracks]
    }