// knownValues from cook.json and visit.json. Records may carry other values
// (§4): show them as "Other", never reject them.
export const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "bread", label: "Bread" },
  { value: "dessert", label: "Dessert" },
  { value: "drinks", label: "Drinks" },
] as const;

export function mealTypeLabel(value: string): string {
  return MEAL_TYPES.find((m) => m.value === value)?.label ?? "Other";
}
