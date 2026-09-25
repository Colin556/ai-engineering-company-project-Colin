from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from database import db_lock, suppliers_table


class SupplierStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


class SupplierCategory(StrEnum):
    MEAT = "meat"
    PRODUCE = "produce"
    SAUCE = "sauce"
    BEVERAGE = "beverage"
    PACKAGING = "packaging"
    CLEANING = "cleaning"


class SupplierCountry(StrEnum):
    COLOMBIA = "CO"
    UNITED_STATES = "US"


class SupplierCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    country: SupplierCountry
    product_categories: list[SupplierCategory] = Field(min_length=1)
    rate_per_unit: float = Field(gt=0)
    status: SupplierStatus


class SupplierResponse(SupplierCreate):
    id: int
    updated_at: datetime


class SupplierRateUpdate(BaseModel):
    rate_per_unit: float = Field(gt=0)


class SupplierStatusUpdate(BaseModel):
    status: SupplierStatus


router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_supplier(document: dict, document_id: int) -> SupplierResponse:
    return SupplierResponse.model_validate({"id": document_id, **document})


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(supplier: SupplierCreate) -> SupplierResponse:
    document = {
        **supplier.model_dump(mode="json"),
        "updated_at": utc_now().isoformat(),
    }
    with db_lock:
        document_id = suppliers_table.insert(document)
    return serialize_supplier(document, document_id)


@router.get("", response_model=list[SupplierResponse])
def list_suppliers(
    country: SupplierCountry | None = None,
    category: SupplierCategory | None = Query(default=None),
) -> list[SupplierResponse]:
    with db_lock:
        documents = list(suppliers_table.all())

    return [
        serialize_supplier(document, document.doc_id)
        for document in documents
        if (country is None or document["country"] == country.value)
        and (
            category is None
            or category.value in document["product_categories"]
        )
    ]


def get_supplier_or_404(supplier_id: int):
    with db_lock:
        document = suppliers_table.get(doc_id=supplier_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Supplier not found.")
    return document


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: int) -> SupplierResponse:
    document = get_supplier_or_404(supplier_id)
    return serialize_supplier(document, supplier_id)


@router.patch("/{supplier_id}/rate", response_model=SupplierResponse)
def update_supplier_rate(
    supplier_id: int, update: SupplierRateUpdate
) -> SupplierResponse:
    get_supplier_or_404(supplier_id)
    changes = {
        "rate_per_unit": update.rate_per_unit,
        "updated_at": utc_now().isoformat(),
    }
    with db_lock:
        suppliers_table.update(changes, doc_ids=[supplier_id])
        document = suppliers_table.get(doc_id=supplier_id)
    return serialize_supplier(document, supplier_id)


@router.patch("/{supplier_id}/status", response_model=SupplierResponse)
def update_supplier_status(
    supplier_id: int, update: SupplierStatusUpdate
) -> SupplierResponse:
    get_supplier_or_404(supplier_id)
    with db_lock:
        suppliers_table.update(
            {"status": update.status.value}, doc_ids=[supplier_id]
        )
        document = suppliers_table.get(doc_id=supplier_id)
    return serialize_supplier(document, supplier_id)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: int) -> None:
    get_supplier_or_404(supplier_id)
    with db_lock:
        suppliers_table.remove(doc_ids=[supplier_id])