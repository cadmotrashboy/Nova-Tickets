import { create } from 'zustand';
import type { TicketBatch, ReserveItemPayload } from '../types/database';

export interface CartItem {
  batch: TicketBatch;
  quantity: number;
}

interface CartState {
  eventId: string | null;
  items: Record<string, CartItem>;
  setQuantity: (batch: TicketBatch, quantity: number) => void;
  clearCart: () => void;
  setEventId: (eventId: string) => void;
  getTotalCount: () => number;
  getSubtotal: () => number;
  getTotalFee: () => number;
  getTotalAmount: () => number;
  getItemsPayload: () => ReserveItemPayload[];
}

export const useCartStore = create<CartState>((set, get) => ({
  eventId: null,
  items: {},

  setEventId: (eventId: string) => {
    const current = get().eventId;
    if (current && current !== eventId) {
      // Se mudar de evento, reseta o carrinho
      set({ eventId, items: {} });
    } else {
      set({ eventId });
    }
  },

  setQuantity: (batch: TicketBatch, quantity: number) => {
    set((state) => {
      const items = { ...state.items };
      const clampedQty = Math.max(0, Math.min(quantity, batch.available_quantity, 10)); // max 10 por compra

      if (clampedQty <= 0) {
        delete items[batch.id];
      } else {
        items[batch.id] = {
          batch,
          quantity: clampedQty,
        };
      }

      return {
        eventId: batch.event_id,
        items,
      };
    });
  },

  clearCart: () => {
    set({ items: {}, eventId: null });
  },

  getTotalCount: () => {
    const { items } = get();
    return Object.values(items).reduce((acc, curr) => acc + curr.quantity, 0);
  },

  getSubtotal: () => {
    const { items } = get();
    return Object.values(items).reduce(
      (acc, curr) => acc + curr.batch.price * curr.quantity,
      0
    );
  },

  getTotalFee: () => {
    const { items } = get();
    return Object.values(items).reduce((acc, curr) => {
      const itemTotal = curr.batch.price * curr.quantity;
      const fee = Number(((itemTotal * (curr.batch.fee_percentage || 0)) / 100).toFixed(2));
      return acc + fee;
    }, 0);
  },

  getTotalAmount: () => {
    return Number((get().getSubtotal() + get().getTotalFee()).toFixed(2));
  },

  getItemsPayload: (): ReserveItemPayload[] => {
    const { items } = get();
    return Object.values(items).map((item) => ({
      batch_id: item.batch.id,
      quantity: item.quantity,
    }));
  },
}));

