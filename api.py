import asyncio
import hashlib
import json
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

# ========================= CONFIG =========================
QOBUZ_BASE_URL = "https://www.qobuz.com/api.json/0.2"

APP_ID = os.getenv("QOBUZ_APP_ID")
APP_SECRET = os.getenv("QOBUZ_APP_SECRET")
USER_AUTH_TOKEN = os.getenv("QOBUZ_USER_AUTH_TOKEN")
COUNTRY_CODE = os.getenv("COUNTRY_CODE", "PT")

API_VERSION = "2.1-bacardii-hires"

# ====================== LIFESPAN ======================
@asynccontextmanager
async def lifespan(app: FastAPI):
    client = httpx.AsyncClient(
        http2=True,
        timeout=httpx.Timeout(15.0),
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=50)
    )
    app.state.http_client = client
    print(f"🚀 Qobuz Hi-Res Backend started | Country: {COUNTRY_CODE} | Strict 24-bit only")
    yield
    await client.aclose()

app = FastAPI(
    title="Qobuz’s Bitch - bacardii",
    version=API_VERSION,
    description="Strict 24-bit Hi-Res Qobuz for 8SPINE",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====================== HELPERS ======================
async def qobuz_get(endpoint: str, params: dict = None):
    if not APP_ID:
        raise HTTPException(500, "APP_ID missing")
    if not USER_AUTH_TOKEN:
        raise HTTPException(500, "USER_AUTH_TOKEN missing")

    url = f"{QOBUZ_BASE_URL}/{endpoint.lstrip('/')}"
    headers = {
        "X-App-Id": APP_ID,
        "X-User-Auth-Token": USER_AUTH_TOKEN
    }

    client: httpx.AsyncClient = app.state.http_client

    try:
        resp = await client.get(url, headers=headers, params=params or {})
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, 
                          detail=f"Qobuz Error: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(503, f"Connection error: {str(e)}")


def build_sig(track_id: int, format_id: int = 27):
    unix_ts = int(time.time())
    data = f"trackgetFileUrlformat_id{format_id}intentstreamtrack_id{track_id}{unix_ts}{APP_SECRET}"
    sig = hashlib.md5(data.encode()).hexdigest()
    return sig, unix_ts


def is_strict_hires(track):
    """Very strict 24-bit filter"""
    return (track.get("maximum_bit_depth") or 0) >= 24 or (track.get("bit_depth") or 0) >= 24


# ====================== 8SPINE ENDPOINTS ======================

@app.get("/8spine/search")
async def spine_search(q: str = Query(..., min_length=1), limit: int = 25):
    data = await qobuz_get("track/search", {
        "query": q,
        "limit": min(limit * 3, 150),   # Fetch more then filter
        "country_code": COUNTRY_CODE
    })

    tracks = []
    for t in data.get("tracks", {}).get("items", []):
        if is_strict_hires(t):
            tracks.append({
                "id": str(t["id"]),
                "title": t["title"],
                "artist": t.get("performer", {}).get("name", "Unknown Artist"),
                "album": t.get("album", {}).get("title", ""),
                "albumId": str(t.get("album", {}).get("id", "")),
                "duration": t.get("duration", 0),
                "audioQuality": "24-bit Hi-Res",
                "cover": t.get("album", {}).get("image", {}).get("large")
            })
            if len(tracks) >= limit:
                break

    return {"tracks": tracks, "total": len(tracks)}


@app.get("/8spine/album")
async def spine_album(album_id: str):
    data = await qobuz_get("album/get", {
        "album_id": album_id,
        "limit": 100,
        "country_code": COUNTRY_CODE
    })

    tracks = []
    for t in data.get("tracks", {}).get("items", []):
        if is_strict_hires(t):
            tracks.append({
                "id": str(t["id"]),
                "title": t["title"],
                "artist": t.get("performer", {}).get("name") or data.get("artist", {}).get("name"),
                "album": data.get("title"),
                "albumCover": data.get("image", {}).get("large"),
                "duration": t.get("duration"),
                "trackNumber": t.get("track_number"),
                "audioQuality": "24-bit Hi-Res"
            })

    return {
        "album": {
            "id": str(album_id),
            "title": data.get("title"),
            "artist": data.get("artist", {}).get("name"),
            "cover": data.get("image", {}).get("large"),
            "year": str(data.get("release_date_original", ""))[:4] if data.get("release_date_original") else None
        },
        "tracks": tracks
    }


@app.get("/8spine/stream/{track_id}")
async def spine_stream(track_id: int):
    """Returns direct stream URL - 24-bit only"""
    sig, unix_ts = build_sig(track_id, 27)   # 27 = Hi-Res

    params = {
        "track_id": track_id,
        "format_id": 27,
        "intent": "stream",
        "request_ts": unix_ts,
        "request_sig": sig
    }

    data = await qobuz_get("track/getFileUrl", params)
    
    if not data.get("url"):
        raise HTTPException(404, "Stream URL not available")

    return {
        "streamUrl": data["url"],
        "quality": "24-bit Hi-Res FLAC",
        "success": True
    }


@app.get("/health")
async def health():
    return {
        "status": "running",
        "version": API_VERSION,
        "country": COUNTRY_CODE,
        "strict_hires_only": True,
        "for": "8SPINE"
    }


# ====================== RUN ======================
if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=7979, reload=True)
