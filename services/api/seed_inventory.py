"""Seed Brasaland's demo inventory using an existing TinyDB user's UUID."""

from __future__ import annotations

import argparse
from decimal import Decimal

from sqlmodel import Session, func, select

from accounts import get_user_by_id
import database
from models import Ingredient, IngredientEntry, IngredientExit

INGREDIENTS = (
    ("Beef brisket", "BRS-BEEF-001", "kg", "meat", "CO"),
    ("Pork ribs", "BRS-PORK-001", "kg", "meat", "US"),
    ("Chimichurri sauce", "BRS-SAUCE-001", "litre", "sauce", "CO"),
    ("House BBQ sauce", "BRS-SAUCE-002", "litre", "sauce", "US"),
    ("Yuca (cassava)", "BRS-PROD-001", "kg", "produce", "CO"),
    ("Takeaway box (M)", "BRS-PKG-001", "unit", "packaging", "CO"),
)
ENTRIES = (
    ("BRS-BEEF-001", "50", "Carnes del Valle S.A.", 1),
    ("BRS-BEEF-001", "30", "Carnes del Valle S.A.", 1),
    ("BRS-PORK-001", "40", "MiamiMeat Co.", 11),
    ("BRS-SAUCE-001", "20", "Salsas Artesanales Ltda.", 1),
)
EXITS = (
    ("BRS-BEEF-001", "10", "consumption", 1),
    ("BRS-PORK-001", "5", "consumption", 11),
    ("BRS-SAUCE-001", "2", "waste", 1),
)


def current_stock(session: Session, ingredient_id: int) -> Decimal:
    inbound = session.exec(select(func.coalesce(func.sum(IngredientEntry.quantity), 0)).where(
        IngredientEntry.ingredient_id == ingredient_id
    )).one()
    outbound = session.exec(select(func.coalesce(func.sum(IngredientExit.quantity), 0)).where(
        IngredientExit.ingredient_id == ingredient_id
    )).one()
    return inbound - outbound


def seed_inventory(session: Session, user_uuid: str) -> dict[str, float]:
    user = get_user_by_id(user_uuid)
    if user is None or not user["is_active"]:
        raise ValueError("Seed orders require an existing, active TinyDB user UUID.")

    with session.begin():
        ingredients = {}
        for name, sku, unit, category, country in INGREDIENTS:
            ingredient = session.exec(select(Ingredient).where(Ingredient.sku == sku)).first()
            if ingredient is None:
                ingredient = Ingredient.model_validate({
                    "name": name, "sku": sku, "unit": unit, "category": category, "country": country,
                })
                session.add(ingredient)
                session.flush()
            elif (ingredient.name, ingredient.unit, ingredient.category, ingredient.country) != (
                name, unit, category, country
            ):
                raise ValueError(f"Existing ingredient {sku} does not match the Brasaland demo specification.")
            ingredients[sku] = ingredient

        for ingredient in sorted(ingredients.values(), key=lambda ingredient: ingredient.id):
            session.exec(select(Ingredient).where(Ingredient.id == ingredient.id).with_for_update()).one()

        for sku, quantity, supplier_name, location_id in ENTRIES:
            ingredient_id = ingredients[sku].id
            existing = session.exec(select(IngredientEntry).where(
                IngredientEntry.ingredient_id == ingredient_id,
                IngredientEntry.quantity == Decimal(quantity),
                IngredientEntry.supplier_name == supplier_name,
                IngredientEntry.location_id == location_id,
            )).first()
            if existing is None:
                session.add(IngredientEntry.model_validate({
                    "ingredient_id": ingredient_id, "quantity": quantity,
                    "supplier_name": supplier_name, "location_id": location_id, "user_uuid": user_uuid,
                }))
        session.flush()

        for sku, quantity, reason, location_id in EXITS:
            ingredient_id = ingredients[sku].id
            existing = session.exec(select(IngredientExit).where(
                IngredientExit.ingredient_id == ingredient_id,
                IngredientExit.quantity == Decimal(quantity),
                IngredientExit.reason == reason,
                IngredientExit.location_id == location_id,
            )).first()
            if existing is None:
                if Decimal(quantity) > current_stock(session, ingredient_id):
                    raise ValueError(f"Insufficient stock to seed an exit for {sku}; no seed changes were saved.")
                session.add(IngredientExit.model_validate({
                    "ingredient_id": ingredient_id, "quantity": quantity,
                    "reason": reason, "location_id": location_id, "user_uuid": user_uuid,
                }))
                session.flush()
        stocks = {sku: float(current_stock(session, ingredient.id)) for sku, ingredient in ingredients.items()}
    return stocks


def run_seed() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-uuid", required=True, help="UUID returned by /auth/me for an existing user")
    arguments = parser.parse_args()
    database.initialize_inventory()
    with Session(database.engine) as session:
        try:
            stocks = seed_inventory(session, arguments.user_uuid)
        except ValueError as error:
            parser.exit(1, f"{error}\n")
    for sku, stock in stocks.items():
        print(f"{sku}: {stock}")


if __name__ == "__main__":
    run_seed()