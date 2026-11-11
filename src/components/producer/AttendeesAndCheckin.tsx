import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Filter, 
  Calendar, 
  User, 
  Mail, 
  FileText, 
  Loader2, 
  AlertCircle,
  Ticket as TicketIcon,
  Check
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { Organizer, Event, Ticket, TicketBatch } from '../../types/database';
import { formatFullDate, formatShortDate, maskCPF, exportToCSV } from '../../utils/formatters';

interface AttendeesAndCheckinProps {
  organizer: Organizer;
}

interface EnrichedTicketRow extends Ticket {
  events?: Event;
  ticket_batches?: TicketBatch;
}

export const AttendeesAndCheckin: React.FC<AttendeesAndCheckinProps> = ({ organizer }) => {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [tickets, setTickets] = useState<EnrichedTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'used'>('all');
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadEventsAndTickets();
  }, [organizer.id]);

  const loadEventsAndTickets = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!isSupabaseConfigured) {
        setTickets([]);
        setLoading(false);
        return;
      }

      // 1. Busca eventos do organizador
      const { data: orgEvents, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', organizer.id)
        .order('start_date', { ascending: false });

      if (eventsError) throw eventsError;

      const eventsList = orgEvents as Event[];
      setEvents(eventsList);

      if (eventsList.length === 0) {
        setLoading(false);
        return;
      }

      const eventIds = eventsList.map((e) => e.id);

      // 2. Busca todos os tickets associados aos eventos deste organizador
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('tickets')
        .select(`
          *,
          events (*),
          ticket_batches (*)
        `)
        .in('event_id', eventIds)
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      setTickets(ticketsData as unknown as EnrichedTicketRow[]);
    } catch (err: any) {
      console.error('Erro ao carregar participantes:', err);
      setErrorMessage(err.message || 'Erro ao carregar participantes.');
    } finally {
      setLoading(false);
    }
  };

  // Realiza o Check-in manual de um ingresso
  const handlePerformCheckIn = async (ticket: EnrichedTicketRow) => {
    if (!user) return;
    setCheckingInId(ticket.id);
    setErrorMessage(null);

    try {
      if (!isSupabaseConfigured) {
        // Fallback local
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticket.id
              ? {
                  ...t,
                  status: 'used',
                  checked_in_at: new Date().toISOString(),
                  checked_in_by: user.id,
                }
              : t
          )
        );
        return;
      }

      // Atualiza o ticket no Supabase (respeitando a RLS "tickets: organizador faz checkin")
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('tickets')
        .update({
          status: 'used',
          checked_in_at: nowIso,
          checked_in_by: user.id,
        })
        .eq('id', ticket.id);

      if (error) {
        throw new Error(error.message || 'Falha ao confirmar check-in.');
      }

      // Atualiza o estado local imediatamente para feedback instantâneo
      setTickets((prev) =>
        prev.map((t) =>
          t.id === ticket.id
            ? {
                ...t,
                status: 'used',
                checked_in_at: nowIso,
                checked_in_by: user.id,
              }
            : t
        )
      );
    } catch (err: any) {
      console.error('Erro no check-in:', err);
      setErrorMessage(err.message || 'Não foi possível realizar o check-in.');
    } finally {
      setCheckingInId(null);
    }
  };

  // Exportação para arquivo CSV
  const handleExportCSV = () => {
    if (filteredTickets.length === 0) {
      alert('Não há participantes para exportar com os filtros atuais.');
      return;
    }

    const headers = [
      'ID Ingresso',
      'Evento',
      'Lote',
      'Nome do Titular',
      'CPF',
      'E-mail',
      'Status',
      'Data de Compra',
      'Horário de Check-in',
      'QR Code Hash',
    ];

    const rows = filteredTickets.map((t) => [
      t.id,
      t.events?.title || '',
      t.ticket_batches?.name || '',
      t.owner_name,
      t.owner_cpf,
      t.owner_email,
      t.status === 'used' ? 'Utilizado' : t.status === 'valid' ? 'Válido' : 'Cancelado',
      t.created_at,
      t.checked_in_at || 'Não realizado',
      t.qr_code_hash,
    ]);

    const eventName = selectedEventId === 'all'
      ? 'todos_os_eventos'
      : events.find((e) => e.id === selectedEventId)?.slug || 'evento';

    exportToCSV(`participantes_${eventName}_${Date.now()}`, headers, rows);
  };

  // Filtros em memória (em tempo real)
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchEvent = selectedEventId === 'all' || t.event_id === selectedEventId;
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;

      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        t.owner_name.toLowerCase().includes(query) ||
        t.owner_cpf.toLowerCase().includes(query) ||
        t.owner_email.toLowerCase().includes(query) ||
        t.id.toLowerCase().includes(query) ||
        t.qr_code_hash.toLowerCase().includes(query);

      return matchEvent && matchStatus && matchSearch;
    });
  }, [tickets, selectedEventId, statusFilter, searchQuery]);

  const totalInscritos = filteredTickets.length;
  const totalCheckedIn = filteredTickets.filter((t) => t.status === 'used').length;

  return (
    <div className="space-y-6">
      
      {/* Alerta de erro */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Aviso na operação de portaria</p>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Header com filtros e Exportar CSV */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">
              Participantes & Check-in na Portaria
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Busque participantes por nome, CPF ou código do ingresso e confirme a entrada em tempo real.
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            disabled={filteredTickets.length === 0}
            className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow flex items-center gap-2 self-start sm:self-auto disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CSV ({filteredTickets.length})</span>
          </button>
        </div>

        {/* Linha de Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-gray-100">
          
          {/* Busca por texto */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, CPF, e-mail ou ID..."
              className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-600 transition"
            />
          </div>

          {/* Filtro por Evento */}
          <div className="sm:col-span-4">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-600 transition font-medium"
            >
              <option value="all">Todos os Eventos</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Status */}
          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-600 transition font-medium"
            >
              <option value="all">Todos os Status</option>
              <option value="valid">Válidos (Não entraram)</option>
              <option value="used">Check-in Efetuado</option>
            </select>
          </div>
        </div>

        {/* Badges de Resumo */}
        <div className="flex items-center gap-4 text-xs font-semibold text-gray-600 pt-1">
          <span>Total: <strong>{totalInscritos}</strong></span>
          <span className="text-emerald-600">Check-in Realizado: <strong>{totalCheckedIn}</strong></span>
          <span className="text-blue-600">Restantes: <strong>{totalInscritos - totalCheckedIn}</strong></span>
        </div>
      </div>

      {/* Tabela de Participantes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
            <p className="text-xs font-semibold">Carregando lista de participantes...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-16 p-6">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-gray-700">Nenhum participante encontrado</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Ajuste os filtros de busca ou verifique se há compras confirmadas para os eventos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3.5 px-4">Titular</th>
                  <th className="py-3.5 px-4">Evento / Lote</th>
                  <th className="py-3.5 px-4">Documento</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Ação de Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredTickets.map((t) => {
                  const isUsed = t.status === 'used';
                  const isProcessing = checkingInId === t.id;

                  return (
                    <tr key={t.id} className="hover:bg-blue-50/20 transition">
                      
                      {/* Dados do Titular */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 leading-tight">
                          {t.owner_name}
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <span>{t.owner_email}</span>
                        </div>
                      </td>

                      {/* Evento e Lote */}
                      <td className="py-3.5 px-4 max-w-[200px]">
                        <div className="font-semibold text-gray-800 truncate">
                          {t.events?.title || 'Evento'}
                        </div>
                        <span className="text-[11px] text-blue-600 font-bold block mt-0.5">
                          {t.ticket_batches?.name || 'Geral'}
                        </span>
                      </td>

                      {/* CPF / ID */}
                      <td className="py-3.5 px-4 font-mono text-gray-600">
                        <div>{maskCPF(t.owner_cpf)}</div>
                        <span className="text-[10px] text-gray-400 block">ID: {t.id.slice(0, 8)}</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {isUsed ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Entrada Validada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                            <TicketIcon className="w-3 h-3" />
                            <span>Válido</span>
                          </span>
                        )}

                        {t.checked_in_at && (
                          <span className="text-[10px] text-gray-400 block mt-1">
                            Às {formatShortDate(t.checked_in_at)}
                          </span>
                        )}
                      </td>

                      {/* Botão de Check-in Manual */}
                      <td className="py-3.5 px-4 text-right">
                        {isUsed ? (
                          <span className="text-[11px] text-emerald-600 font-bold flex items-center justify-end gap-1">
                            <Check className="w-3.5 h-3.5" /> Check-in Feito
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handlePerformCheckIn(t)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isProcessing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Fazer Check-in</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
