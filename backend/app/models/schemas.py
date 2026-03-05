from pydantic import BaseModel, HttpUrl, field_validator
from typing import Optional, Any
import re

UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
SHADOW_ID_RE = re.compile(r'^[0-9a-f]{64}$')


class AnalyzeRequest(BaseModel):
    url: str

    @field_validator('url')
    @classmethod
    def validate_url_length(cls, v):
        if len(v) > 2048:
            raise ValueError('URL must be 2048 characters or fewer')
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must use http or https scheme')
        return v


class ScanResponse(BaseModel):
    scan_id: str
    status: str


class ScanResult(BaseModel):
    scan_id: str
    status: str
    result: Optional[Any] = None
    created_at: int
    completed_at: Optional[int] = None


class SessionStats(BaseModel):
    scan_count: int
    first_seen: int
    last_seen: int
