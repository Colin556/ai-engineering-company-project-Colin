"""Bounded worker-local caches for public, validated read projections."""

from __future__ import annotations

import json
import os
from collections import OrderedDict
from collections.abc import Callable, Hashable
from copy import deepcopy
from time import monotonic
from typing import Generic, TypeVar

from fastapi.encoders import jsonable_encoder

from core import db_lock

Projection = TypeVar("Projection")


class ReadCache(Generic[Projection]):
    def __init__(
        self, ttl: float, max_bytes: int, max_entries: int = 24,
        timer: Callable[[], float] = monotonic,
    ) -> None:
        if ttl <= 0 or max_bytes <= 0 or max_entries <= 0:
            raise ValueError("Cache TTL and capacity must be positive")
        self.ttl = ttl
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.timer = timer
        self._entries: OrderedDict[Hashable, tuple[float, Projection, int]] = OrderedDict()
        self._bytes = 0

    def get_or_load(self, key: Hashable, load: Callable[[], Projection]) -> Projection:
        if os.getenv("RESPONSE_CACHE_ENABLED", "1") == "0":
            return load()
        with db_lock:
            now = self.timer()
            for expired in [key for key, entry in self._entries.items() if entry[0] <= now]:
                self._bytes -= self._entries.pop(expired)[2]
            if key in self._entries:
                self._entries.move_to_end(key)
                return deepcopy(self._entries[key][1])
            value = load()
            size = len(json.dumps(jsonable_encoder(value), separators=(",", ":")).encode())
            if size <= self.max_bytes:
                while self._entries and (
                    len(self._entries) >= self.max_entries or self._bytes + size > self.max_bytes
                ):
                    self._bytes -= self._entries.popitem(last=False)[1][2]
                self._entries[key] = (self.timer() + self.ttl, deepcopy(value), size)
                self._bytes += size
            return value

    def invalidate(self) -> None:
        with db_lock:
            self._entries.clear()
            self._bytes = 0


incident_summary_cache = ReadCache(ttl=15, max_bytes=16 * 1024, max_entries=1)
supplier_list_cache = ReadCache(ttl=30, max_bytes=1024 * 1024)