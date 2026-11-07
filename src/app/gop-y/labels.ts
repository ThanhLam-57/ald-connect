import { feedbackCategories } from "../../lib/content";

export function categoryLabel(id: string) {
  return feedbackCategories.find((item) => item.id === id)?.label ?? "Khác";
}

export function ticketLabel(id: string) {
  return "#" + id.slice(0, 8).toUpperCase();
}
