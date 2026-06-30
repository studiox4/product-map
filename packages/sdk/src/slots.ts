export type SlotId = 'copilot.panel' | 'settings.integrations' | 'nav.analytics';

export interface SlotRegistration {
  id: SlotId;
  /** Lazily imports the module whose default export fills the slot. */
  loader: () => Promise<unknown>;
}

export interface SlotRegistry {
  register(reg: SlotRegistration): void;
  get(id: SlotId): SlotRegistration | undefined;
  has(id: SlotId): boolean;
}

export function createSlotRegistry(): SlotRegistry {
  const slots = new Map<SlotId, SlotRegistration>();
  return {
    register: (reg) => { slots.set(reg.id, reg); },
    get: (id) => slots.get(id),
    has: (id) => slots.has(id),
  };
}

/** Shared singleton — the edition registers into this at module-load. */
export const slotRegistry: SlotRegistry = createSlotRegistry();
