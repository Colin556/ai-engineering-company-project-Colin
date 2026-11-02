"""Brasaland inventory: immutable order history determines ingredient stock."""

from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from accounts import get_current_user
from database import get_db
from models import Ingredient, IngredientEntry, IngredientExit
from schemas import (
    IngredientCountry,
    DirectStockEdit,
    InventoryLocationSettings,
    IngredientCreate,
    IngredientEntryCreate,
    IngredientEntryListItem,
    IngredientEntryResponse,
    IngredientExitCreate,
    IngredientExitListItem,
    IngredientExitResponse,
    IngredientResponse,
    UserResponse,
)
from suppliers import get_supplier

router = APIRouter(
    prefix="/inventory", tags=["inventory"], dependencies=[Depends(get_current_user)]
)


def stock_query(location_id: int | None = None):
    entries = (
        select(IngredientEntry.ingredient_id, func.sum(IngredientEntry.quantity).label("total"))
        .group_by(IngredientEntry.ingredient_id)
        .subquery()
    )
    if location_id is not None:
        entries = (
            select(IngredientEntry.ingredient_id, func.sum(IngredientEntry.quantity).label("total"))
            .where(IngredientEntry.location_id == location_id)
            .group_by(IngredientEntry.ingredient_id).subquery()
        )
        exits = (
            select(IngredientExit.ingredient_id, func.sum(IngredientExit.quantity).label("total"))
            .where(IngredientExit.location_id == location_id)
            .group_by(IngredientExit.ingredient_id).subquery()
        )
    exits = (
        select(IngredientExit.ingredient_id, func.sum(IngredientExit.quantity).label("total"))
        .group_by(IngredientExit.ingredient_id)
        .subquery()
    )
    return (
        select(
            Ingredient,
            (func.coalesce(entries.c.total, 0) - func.coalesce(exits.c.total, 0)).label("current_stock"),
        )
        .outerjoin(entries, entries.c.ingredient_id == Ingredient.id)
        .outerjoin(exits, exits.c.ingredient_id == Ingredient.id)
    )


def ingredient_response(ingredient: Ingredient, stock: Decimal) -> IngredientResponse:
    return IngredientResponse.model_validate({**ingredient.model_dump(), "current_stock": stock})


def ingredient_with_stock(session: Session, ingredient_id: int) -> IngredientResponse:
    row = session.exec(stock_query().where(Ingredient.id == ingredient_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Ingredient not found.")
    return ingredient_response(*row)


def lock_ingredient(session: Session, ingredient_id: int) -> Ingredient:
    ingredient = session.exec(
        select(Ingredient).where(Ingredient.id == ingredient_id).with_for_update()
    ).first()
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found.")
    return ingredient


def inventory_dimensions(ingredient: Ingredient, location_id: int, quantity: float) -> dict:
    country = "CO" if location_id <= 10 else "US"
    return {
        "location_id": location_id, "country": country, "product_id": ingredient.id,
        "product_category": ingredient.category, "quantity": quantity,
        "unit": ingredient.unit, "currency": "COP" if country == "CO" else "USD",
    }


def validate_market(ingredient: Ingredient, location_id: int) -> None:
    if ingredient.country != ("CO" if location_id <= 10 else "US"):
        raise HTTPException(status_code=422, detail="Product and location must belong to the same country.")


@router.put("/products/{ingredient_id}/locations/{location_id}/settings", response_model=InventoryLocationSettings)
def configure_location(
    ingredient_id: int, location_id: int, payload: InventoryLocationSettings,
    user: UserResponse = Depends(get_current_user), session: Session = Depends(get_db),
) -> InventoryLocationSettings:
    if user.role not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Only managers can configure inventory controls.")
    if not 1 <= location_id <= 14:
        raise HTTPException(status_code=422, detail="Invalid location.")
    ingredient = lock_ingredient(session, ingredient_id)
    validate_market(ingredient, location_id)
    ingredient.location_settings = {**ingredient.location_settings, str(location_id): payload.model_dump()}
    session.add(ingredient)
    session.commit()
    return payload


@router.patch("/products/{ingredient_id}/stock", response_model=dict[str, str])
def reject_direct_stock_edit(
    ingredient_id: int, payload: DirectStockEdit, session: Session = Depends(get_db),
) -> None:
    ingredient = lock_ingredient(session, ingredient_id)
    validate_market(ingredient, payload.location_id)
    raise HTTPException(status_code=403, detail={
        "message": "Stock changes require an inbound or outbound order.",
        "telemetry_event": {
            "event_type": "direct_stock_edit_rejected",
            "properties": {**inventory_dimensions(ingredient, payload.location_id, payload.quantity), "rejection_code": "order_required"},
        },
    })


@router.get("/products/{ingredient_id}/locations/{location_id}/settings", response_model=InventoryLocationSettings | None)
def get_location_settings(
    ingredient_id: int, location_id: int, session: Session = Depends(get_db),
) -> InventoryLocationSettings | None:
    if not 1 <= location_id <= 14:
        raise HTTPException(status_code=422, detail="Invalid location.")
    ingredient = session.get(Ingredient, ingredient_id)
    if ingredient is None:
        raise HTTPException(status_code=404, detail="Ingredient not found.")
    validate_market(ingredient, location_id)
    settings = ingredient.location_settings.get(str(location_id))
    return InventoryLocationSettings.model_validate(settings) if settings else None


@router.get("/products", response_model=list[IngredientResponse])
def list_ingredients(
    country: IngredientCountry | None = None,
    session: Session = Depends(get_db),
) -> list[IngredientResponse]:
    statement = stock_query().order_by(Ingredient.id)
    if country is not None:
        statement = statement.where(Ingredient.country == country)
    return [ingredient_response(*row) for row in session.exec(statement).all()]


@router.post("/products", response_model=IngredientResponse, status_code=201)
def create_ingredient(
    payload: IngredientCreate,
    session: Session = Depends(get_db),
) -> IngredientResponse:
    ingredient = Ingredient.model_validate(payload.model_dump())
    session.add(ingredient)
    try:
        session.commit()
    except Exception as error:
        session.rollback()
        if getattr(getattr(error, "orig", None), "pgcode", None) == "23505" or (
            "UNIQUE constraint failed: ingredient.sku" in str(error)
        ):
            raise HTTPException(status_code=409, detail="An ingredient with this SKU already exists.") from error
        raise
    session.refresh(ingredient)
    return ingredient_response(ingredient, Decimal(0))


@router.get("/products/{ingredient_id}", response_model=IngredientResponse)
def get_ingredient(
    ingredient_id: int,
    session: Session = Depends(get_db),
) -> IngredientResponse:
    return ingredient_with_stock(session, ingredient_id)


@router.post("/orders/inbound", response_model=IngredientEntryResponse, status_code=201)
def create_entry(
    payload: IngredientEntryCreate,
    user: UserResponse = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> IngredientEntryResponse:
    ingredient = lock_ingredient(session, payload.ingredient_id)
    events = []
    if payload.supplier_id is not None:
        validate_market(ingredient, payload.location_id)
        supplier = get_supplier(payload.supplier_id)
        if supplier.country != ingredient.country or supplier.status != "active":
            raise HTTPException(status_code=422, detail="Supplier must be active in the product's country.")
        if supplier.name != payload.supplier_name:
            raise HTTPException(status_code=422, detail="Supplier name does not match its identifier.")
        dimensions = inventory_dimensions(ingredient, payload.location_id, float(payload.quantity))
        costs = {"supplier_id": str(payload.supplier_id), "unit_cost": float(payload.unit_cost), "total_cost": float(payload.quantity * payload.unit_cost)}
        events.append({"event_type": "inbound_order_created", "properties": {**dimensions, **costs}})
        settings = ingredient.location_settings.get(str(payload.location_id))
        if settings:
            history = session.exec(select(IngredientEntry.unit_cost).where(
                IngredientEntry.ingredient_id == ingredient.id,
                IngredientEntry.supplier_id == payload.supplier_id,
                IngredientEntry.unit_cost.is_not(None),
                IngredientEntry.created_at >= datetime.now(timezone.utc) - timedelta(days=settings["history_days"]),
            )).all()
            if len(history) >= settings["minimum_samples"]:
                reference = sum(history) / len(history)
                variance = float((payload.unit_cost - reference) / reference * 100) if reference > 0 else 0
                if abs(variance) > settings["threshold_percent"]:
                    events.append({"event_type": "ingredient_price_variance_detected", "properties": {
                        **dimensions, "supplier_id": str(payload.supplier_id), "unit_cost": float(payload.unit_cost),
                        "reference_unit_cost": float(reference), "variance_percent": variance, "threshold_percent": settings["threshold_percent"],
                    }})
    entry = IngredientEntry.model_validate({**payload.model_dump(), "user_uuid": user.id})
    session.add(entry)
    session.flush()
    response = IngredientEntryResponse.model_validate(
        {**entry.model_dump(), "ingredient": ingredient_with_stock(session, entry.ingredient_id), "telemetry_events": events}
    )
    if events:
        events[0]["properties"]["order_id"] = entry.id
        response.telemetry_events[0].properties["order_id"] = entry.id
    session.commit()
    return response


@router.post("/orders/outbound", response_model=IngredientExitResponse, status_code=201)
def create_exit(
    payload: IngredientExitCreate,
    user: UserResponse = Depends(get_current_user),
    session: Session = Depends(get_db),
) -> IngredientExitResponse:
    ingredient = lock_ingredient(session, payload.ingredient_id)
    _, available = session.exec(stock_query().where(Ingredient.id == ingredient.id)).one()
    if payload.quantity > available:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient stock for ingredient '{ingredient.name}'. "
                f"Available: {float(available)}, requested: {float(payload.quantity)}."
            ),
        )
    events = []
    enriched = payload.reason == "consumption" or payload.waste_cause is not None
    if enriched:
        validate_market(ingredient, payload.location_id)
        _, location_stock = session.exec(stock_query(payload.location_id).where(Ingredient.id == ingredient.id)).one()
        if payload.quantity > location_stock:
            raise HTTPException(status_code=400, detail="Insufficient stock at this location.")
        dimensions = inventory_dimensions(ingredient, payload.location_id, float(payload.quantity))
        event_type = "outbound_order_created" if payload.reason == "consumption" else "stock_waste_registered"
        properties = {**dimensions, "reason": "consumption" if payload.reason == "consumption" else payload.waste_cause}
        if payload.waste_cause is not None:
            properties.update(unit_cost=float(payload.unit_cost), total_cost=float(payload.quantity * payload.unit_cost))
        events.append({"event_type": event_type, "properties": properties})
    settings = ingredient.location_settings.get(str(payload.location_id))
    if settings:
        _, location_stock = session.exec(stock_query(payload.location_id).where(Ingredient.id == ingredient.id)).one()
        if payload.quantity > location_stock:
            raise HTTPException(status_code=400, detail="Insufficient stock at this location.")
        minimum = settings["minimum_quantity"]
        after = float(location_stock - payload.quantity)
        if float(location_stock) >= minimum > after:
            events.append({"event_type": "stock_threshold_triggered", "properties": {
                **inventory_dimensions(ingredient, payload.location_id, after), "minimum_quantity": minimum,
            }})
    exit_order = IngredientExit.model_validate({**payload.model_dump(), "user_uuid": user.id})
    session.add(exit_order)
    session.flush()
    response = IngredientExitResponse.model_validate(
        {**exit_order.model_dump(), "ingredient": ingredient_with_stock(session, exit_order.ingredient_id), "telemetry_events": events}
    )
    for draft in response.telemetry_events:
        if draft.event_type in {"outbound_order_created", "stock_waste_registered"}:
            draft.properties["order_id"] = exit_order.id
    session.commit()
    return response


@router.get("/orders", response_model=list[IngredientEntryListItem | IngredientExitListItem])
def list_orders(
    country: IngredientCountry | None = None,
    location_id: int | None = Query(default=None, ge=1, le=14),
    session: Session = Depends(get_db),
) -> list[IngredientEntryListItem | IngredientExitListItem]:
    orders = []
    for order_model, response_model in (
        (IngredientEntry, IngredientEntryListItem),
        (IngredientExit, IngredientExitListItem),
    ):
        statement = select(order_model, Ingredient).join(Ingredient)
        if country is not None:
            statement = statement.where(Ingredient.country == country)
        if location_id is not None:
            statement = statement.where(order_model.location_id == location_id)
        for order, ingredient in session.exec(statement).all():
            orders.append(response_model.model_validate({
                **order.model_dump(),
                "ingredient": ingredient.model_dump(),
            }))
    return sorted(orders, key=lambda order: (order.created_at, order.order_type, order.id))