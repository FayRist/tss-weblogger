import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type RaceMode = 'prerace' | 'live' | 'history';

export interface NavigationContext {
  eventId: number | null;
  raceId: number | null;
  loggerId: string | null;
  segment: string | null;
  classCode: string | null;
  circuit: string | null;
  carNBR: string | null;
  raceMode: RaceMode;
}

const STORAGE_KEY = 'navigation_context_v1';

const DEFAULT_CONTEXT: NavigationContext = {
  eventId: null,
  raceId: null,
  loggerId: null,
  segment: null,
  classCode: null,
  circuit: null,
  carNBR: null,
  raceMode: 'live',
};

@Injectable({ providedIn: 'root' })
export class NavigationContextService {
  private readonly state$ = new BehaviorSubject<NavigationContext>(this.readFromStorage());
  readonly context$ = this.state$.asObservable();

  get snapshot(): NavigationContext {
    return this.state$.value;
  }

  patchContext(partial: Partial<NavigationContext>): void {
    const merged: NavigationContext = {
      ...this.snapshot,
      ...this.normalizePartial(partial),
    };
    this.state$.next(merged);
    this.writeToStorage(merged);
  }

  replaceContext(partial: Partial<NavigationContext>): void {
    const next: NavigationContext = {
      ...DEFAULT_CONTEXT,
      ...this.normalizePartial(partial),
    };
    this.state$.next(next);
    this.writeToStorage(next);
  }

  clearContext(): void {
    this.state$.next(DEFAULT_CONTEXT);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  private normalizePartial(partial: Partial<NavigationContext>): Partial<NavigationContext> {
    const out: Partial<NavigationContext> = {};

    if ('eventId' in partial) {
      out.eventId = this.toId(partial.eventId);
    }
    if ('raceId' in partial) {
      out.raceId = this.toId(partial.raceId);
    }
    if ('loggerId' in partial) {
      out.loggerId = this.toText(partial.loggerId);
    }
    if ('segment' in partial) {
      out.segment = this.toText(partial.segment)?.toLowerCase() ?? null;
    }
    if ('classCode' in partial) {
      out.classCode = this.toText(partial.classCode)?.toLowerCase() ?? null;
    }
    if ('circuit' in partial) {
      out.circuit = this.toText(partial.circuit)?.toLowerCase() ?? null;
    }
    if ('raceMode' in partial) {
      if (partial.raceMode === 'history') {
        out.raceMode = 'history';
      } else if (partial.raceMode === 'prerace') {
        out.raceMode = 'prerace';
      } else {
        out.raceMode = 'live';
      }
    }

    if ('carNBR' in partial) {
      out.carNBR = this.toText(partial.carNBR)?.toLowerCase() ?? null;
    }

    return out;
  }

  private toId(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private toText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const v = value.trim();
    return v ? v : null;
  }

  private readFromStorage(): NavigationContext {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return DEFAULT_CONTEXT;
      }
      const parsed = JSON.parse(raw) as Partial<NavigationContext>;
      return {
        ...DEFAULT_CONTEXT,
        ...this.normalizePartial(parsed),
      };
    } catch {
      return DEFAULT_CONTEXT;
    }
  }

  private writeToStorage(ctx: NavigationContext): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  }
}
