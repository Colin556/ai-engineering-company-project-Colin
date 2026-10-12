export interface BrasalandLocation {
  id: number;
  label: string;
  city: string;
  country: "CO" | "US";
}

export const BRASALAND_LOCATIONS: BrasalandLocation[] = [
  { id: 1, label: "Location #1 — Medellín (El Poblado)", city: "Medellín", country: "CO" },
  { id: 2, label: "Location #2 — Medellín (Laureles)", city: "Medellín", country: "CO" },
  { id: 3, label: "Location #3 — Medellín (Envigado)", city: "Medellín", country: "CO" },
  { id: 4, label: "Location #4 — Medellín (Belén)", city: "Medellín", country: "CO" },
  { id: 5, label: "Location #5 — Bogotá (Zona T)", city: "Bogotá", country: "CO" },
  { id: 6, label: "Location #6 — Bogotá (Usaquén)", city: "Bogotá", country: "CO" },
  { id: 7, label: "Location #7 — Bogotá (Chapinero)", city: "Bogotá", country: "CO" },
  { id: 8, label: "Location #8 — Bogotá (Salitre)", city: "Bogotá", country: "CO" },
  { id: 9, label: "Location #9 — Cali (Granada)", city: "Cali", country: "CO" },
  { id: 10, label: "Location #10 — Cali (San Antonio)", city: "Cali", country: "CO" },
  { id: 11, label: "Location #11 — Miami (Brickell)", city: "Miami", country: "US" },
  { id: 12, label: "Location #12 — Miami (Coral Gables)", city: "Miami", country: "US" },
  { id: 13, label: "Location #13 — Miami (Wynwood)", city: "Miami", country: "US" },
  { id: 14, label: "Location #14 — Orlando (Downtown)", city: "Orlando", country: "US" },
];

export function getLocationLabel(id: number): string {
  const match = BRASALAND_LOCATIONS.find((l) => l.id === id);
  return match ? match.label : `Location #${id}`;
}
