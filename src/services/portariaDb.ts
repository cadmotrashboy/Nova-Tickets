import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Ticket, TicketBatch } from '../types/database';

export interface LocalTicket extends Ticket {
  batch_name?: string;
  batch_price?: number;
}

export interface SyncQueueItem {
  id?: number;
  ticketId: string;
  checkedInAt: string;
  checkedInBy: string;
  createdAt: string;
}

interface PortariaDBSchema extends DBSchema {
  tickets: {
    key: string;
    value: LocalTicket;
    indexes: {
      'by_hash': string;
      'by_event': string;
    };
  };
  syncQueue: {
    key: number;
    value: SyncQueueItem;
  };
}

const DB_NAME = 'nova_tickets_portaria_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PortariaDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<PortariaDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<PortariaDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Tabela de ingressos em cache
        if (!db.objectStoreNames.contains('tickets')) {
          const ticketStore = db.createObjectStore('tickets', { keyPath: 'id' });
          ticketStore.createIndex('by_hash', 'qr_code_hash', { unique: false });
          ticketStore.createIndex('by_event', 'event_id', { unique: false });
        }

        // Fila de sincronização offline
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Salva ou atualiza uma lista de ingressos no cache local IndexedDB.
 */
export async function saveTicketsLocal(tickets: LocalTicket[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('tickets', 'readwrite');
  for (const ticket of tickets) {
    await tx.store.put(ticket);
  }
  await tx.done;
}

/**
 * Atualiza um único ticket no cache local (ex: recebido via Supabase Realtime).
 */
export async function updateTicketLocal(ticket: LocalTicket): Promise<void> {
  const db = await getDb();
  await db.put('tickets', ticket);
}

/**
 * Busca um ingresso no cache local pelo QR Code Hash ou pelo ID do ingresso.
 */
export async function findTicketLocal(
  eventId: string,
  rawHashOrId: string
): Promise<LocalTicket | null> {
  const db = await getDb();
  const cleanInput = rawHashOrId.trim();

  // 1. Tenta buscar diretamente pelo ID primário
  const byId = await db.get('tickets', cleanInput);
  if (byId && byId.event_id === eventId) {
    return byId;
  }

  // 2. Tenta buscar pelo índice de hash
  const byHash = await db.getFromIndex('tickets', 'by_hash', cleanInput);
  if (byHash && byHash.event_id === eventId) {
    return byHash;
  }

  // 3. Busca iterativa caso o QR contenha prefixos/sufixos ou correspondência parcial
  const allForEvent = await db.getAllFromIndex('tickets', 'by_event', eventId);
  const matched = allForEvent.find(
    (t) =>
      t.qr_code_hash === cleanInput ||
      cleanInput.includes(t.qr_code_hash) ||
      t.qr_code_hash.includes(cleanInput) ||
      t.id.startsWith(cleanInput)
  );

  return matched || null;
}

/**
 * Marca o ingresso como utilizado no cache local instantaneamente.
 */
export async function markTicketAsUsedLocal(
  ticketId: string,
  checkedInAt: string,
  checkedInBy: string
): Promise<LocalTicket | null> {
  const db = await getDb();
  const ticket = await db.get('tickets', ticketId);
  if (!ticket) return null;

  ticket.status = 'used';
  ticket.checked_in_at = checkedInAt;
  ticket.checked_in_by = checkedInBy;

  await db.put('tickets', ticket);
  return ticket;
}

/**
 * Retorna as estatísticas de ingressos e check-ins do evento a partir do cache local.
 */
export async function getEventStatsLocal(
  eventId: string
): Promise<{ total: number; checkedIn: number; valid: number }> {
  const db = await getDb();
  const allForEvent = await db.getAllFromIndex('tickets', 'by_event', eventId);

  const total = allForEvent.length;
  const checkedIn = allForEvent.filter((t) => t.status === 'used').length;
  const valid = allForEvent.filter((t) => t.status === 'valid').length;

  return { total, checkedIn, valid };
}

/**
 * Adiciona um check-in pendente à fila de sincronização offline.
 */
export async function addToSyncQueue(
  ticketId: string,
  checkedInAt: string,
  checkedInBy: string
): Promise<void> {
  const db = await getDb();
  await db.add('syncQueue', {
    ticketId,
    checkedInAt,
    checkedInBy,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Retorna todos os itens pendentes na fila de sincronização offline.
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  return db.getAll('syncQueue');
}

/**
 * Remove um item da fila de sincronização após confirmação no Supabase.
 */
export async function removeFromSyncQueue(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('syncQueue', id);
}

