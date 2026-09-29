"""Supplier directory endpoints and initial seed data."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from tinydb import Query as TinyQuery

from accounts import get_current_user
from core import db_lock, suppliers_table
from models import (
    SupplierCategory,
    SupplierCountry,
    SupplierCreate,
    SupplierRateUpdate,
    SupplierResponse,
    SupplierStatusUpdate,
)


# Reads are open so the backoffice can render the catalogue before it handles
# tokens; every mutation still requires a valid token.
router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_supplier(document: dict, document_id: int) -> SupplierResponse:
    return SupplierResponse.model_validate({"id": document_id, **document})


@router.post(
    "",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(get_current_user)],
)
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


@router.patch(
    "/{supplier_id}/rate",
    response_model=SupplierResponse,
    dependencies=[Depends(get_current_user)],
)
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


@router.patch(
    "/{supplier_id}/status",
    response_model=SupplierResponse,
    dependencies=[Depends(get_current_user)],
)
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


@router.delete(
    "/{supplier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(get_current_user)],
)
def delete_supplier(supplier_id: int) -> None:
    get_supplier_or_404(supplier_id)
    with db_lock:
        suppliers_table.remove(doc_ids=[supplier_id])


# ---------- Seed data ----------

INITIAL_SUPPLIERS = (
    SupplierCreate(
        name="Carnes del Valle S.A.",
        country="CO",
        product_categories=["meat"],
        rate_per_unit=18.50,
        status="active",
    ),
    SupplierCreate(
        name="MiamiMeat Co.",
        country="US",
        product_categories=["meat"],
        rate_per_unit=22.75,
        status="active",
    ),
    SupplierCreate(
        name="Salsas Artesanales Ltda.",
        country="CO",
        product_categories=["sauce"],
        rate_per_unit=9.50,
        status="active",
    ),
)


def seed_suppliers() -> int:
    supplier_query = TinyQuery()
    inserted = 0

    with db_lock:
        for supplier in INITIAL_SUPPLIERS:
            if suppliers_table.contains(supplier_query.name == supplier.name):
                continue
            suppliers_table.insert(
                {
                    **supplier.model_dump(mode="json"),
                    "updated_at": utc_now().isoformat(),
                }
            )
            inserted += 1

    return inserted


def run_seed() -> None:
    inserted = seed_suppliers()
    print(f"Supplier seeding complete: {inserted} record(s) inserted.")


if __name__ == "__main__":
    run_seed()
