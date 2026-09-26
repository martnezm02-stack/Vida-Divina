// sectionQueries.ts — Listas completas (sin el tope pensado para widgets de
// Overview) para las secciones de navegación ligeras: Signals, Insights,
// Competitive Intelligence (actores), Creative Intelligence (patrones),
// Watchlists. Pura composición de funciones MI-1..MI-4 ya existentes -- cero
// SQL nuevo, cero regla de negocio nueva.
import { listSignalsByProject } from "../signals";
import { listInsightsByProject } from "../insights";
import { listActorsByProject } from "../actors";
import { listPatternsByProject } from "../patterns";
import { listWatchlistsByProject } from "../watchlists";
import type { Actor, Insight, Pattern, Signal, Watchlist } from "../types";

export function getAllSignals(projectId: number): Signal[] {
  return listSignalsByProject(projectId);
}

export function getAllInsights(projectId: number): Insight[] {
  return listInsightsByProject(projectId);
}

export function getAllActors(projectId: number): Actor[] {
  return listActorsByProject(projectId);
}

export function getAllPatterns(projectId: number): Pattern[] {
  return listPatternsByProject(projectId);
}

export function getAllWatchlists(projectId: number): Watchlist[] {
  return listWatchlistsByProject(projectId);
}
