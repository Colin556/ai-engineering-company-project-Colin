"""Brasaland inventory: immutable order history determines ingredient stock."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from accounts import get_current_user
from database import get_db
from models import Ingredient, IngredientEntry, IngredientExit
from schemas import (
    IngredientCountry,
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

router = APIRouter(
    prefix="/inventory", tags=["inventory"], dependencies=[Depends(get_current_user)]
)


def stock_query():
    entries = (
        select(IngredientEntry.ingredient_id, func.sum(IngredientEntry.quantity).label("total"))
        .group_by(IngredientEntry.ingredient_id)
        .subquery()
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
    lock_ingredient(session, payload.ingredient_id)
    entry = IngredientEntry.model_validate({**payload.model_dump(), "user_uuid": user.id})
    session.add(entry)
    session.flush()
    response = IngredientEntryResponse.model_validate(
        {**entry.model_dump(), "ingredient": ingredient_with_stock(session, entry.ingredient_id)}
    )
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
    exit_order = IngredientExit.model_validate({**payload.model_dump(), "user_uuid": user.id})
    session.add(exit_order)
    session.flush()
    response = IngredientExitResponse.model_validate(
        {**exit_order.model_dump(), "ingredient": ingredient_with_stock(session, exit_order.ingredient_id)}
    )
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