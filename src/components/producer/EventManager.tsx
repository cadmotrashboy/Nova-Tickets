import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  MapPin, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Ticket, 
  Play, 
  Pause, 
  ArrowLeft, 
  Camera,
  Image as ImageIcon,
  DollarSign,
  Percent,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Organizer, Event, TicketBatch, EventStatus, BatchStatus } from '../../types/database';
import { formatCurrency, formatFullDate, formatShortDate, slugify } from '../../utils/formatters';

interface EventManagerProps {
  organizer: Organizer;
  initialEventId?: string;
  initialAction?: 'list' | 'new' | 'edit';
}

export const EventManager: React.FC<EventManagerProps> = ({ 
  organizer, 
  initialEventId, 
  initialAction = 'list' 
}) => {
  const [view, setView] = useState<'list' | 'form' | 'details'>(
    initialAction === 'new' ? 'form' : initialEventId ? 'details' : 'list'
  );

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [batches, setBatches] = useState<TicketBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estado do formulário de evento
  const [eventForm, setEventForm] = useState({
    id: '',
    title: '',
    slug: '',
    description: '',
    banner_url: '',
    location_name: '',
    address: '',
    start_date: '',
    end_date: '',
    status: 'draft' as EventStatus,
  });

  // Modal para criar novo lote
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    name: '',
    price: '',
    fee_percentage: '10',
    total_quantity: '100',
    sales_start: '',
    sales_end: '',
    status: 'active' as BatchStatus,
  });

  useEffect(() => {
    loadEvents();
  }, [organizer.id]);

  useEffect(() => {
    if (initialEventId && events.length > 0) {
      const found = events.find((e) => e.id === initialEventId);
      if (found) {
        handleOpenDetails(found);
      }
    }
  }, [initialEventId, events]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', organizer.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvents(data as Event[]);
    } catch (err: any) {
      console.error('Erro ao carregar eventos:', err);
      setErrorMessage(err.message || 'Falha ao carregar eventos.');
    } finally {
      setLoading(false);
    }
  };

  const loadBatchesForEvent = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from('ticket_batches')
        .select('*')
        .eq('event_id', eventId)
        .order('price', { ascending: true });

      if (error) throw error;
      setBatches(data as TicketBatch[]);
    } catch (err: any) {
      console.error('Erro ao carregar lotes:', err);
    }
  };

  // Abre formulário para novo evento
  const handleNewEvent = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 0, 0, 0);

    const endTomorrow = new Date(tomorrow);
    endTomorrow.setHours(23, 0, 0, 0);

    setEventForm({
      id: '',
      title: '',
      slug: '',
      description: '',
      banner_url: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=80',
      location_name: '',
      address: '',
      start_date: tomorrow.toISOString().slice(0, 16),
      end_date: endTomorrow.toISOString().slice(0, 16),
      status: 'draft',
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setView('form');
  };

  // Abre formulário para editar evento existente
  const handleEditEvent = (ev: Event) => {
    setEventForm({
      id: ev.id,
      title: ev.title,
      slug: ev.slug,
      description: ev.description || '',
      banner_url: ev.banner_url || '',
      location_name: ev.location_name || '',
      address: ev.address || '',
      start_date: new Date(ev.start_date).toISOString().slice(0, 16),
      end_date: new Date(ev.end_date).toISOString().slice(0, 16),
      status: ev.status,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
    setView('form');
  };

  // Abre detalhes e lotes do evento
  const handleOpenDetails = (ev: Event) => {
    setSelectedEvent(ev);
    loadBatchesForEvent(ev.id);
    setView('details');
  };

  // Salva ou atualiza evento
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const start = new Date(eventForm.start_date);
    const end = new Date(eventForm.end_date);

    if (end <= start) {
      setErrorMessage('A data e horário de término devem ser posteriores ao início do evento.');
      return;
    }

    const generatedSlug = eventForm.slug.trim() || slugify(eventForm.title);
    if (!generatedSlug) {
      setErrorMessage('Informe um título válido para gerar o endereço (slug) do evento.');
      return;
    }

    setSavingEvent(true);

    try {
      if (eventForm.id) {
        // Atualiza evento existente
        const { error } = await supabase
          .from('events')
          .update({
            title: eventForm.title.trim(),
            slug: generatedSlug,
            description: eventForm.description.trim() || null,
            banner_url: eventForm.banner_url.trim() || null,
            location_name: eventForm.location_name.trim() || null,
            address: eventForm.address.trim() || null,
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            status: eventForm.status,
          })
          .eq('id', eventForm.id);

        if (error) throw error;
        setSuccessMessage('Evento atualizado com sucesso!');
      } else {
        // Cria novo evento
        const { data, error } = await supabase
          .from('events')
          .insert({
            organizer_id: organizer.id,
            title: eventForm.title.trim(),
            slug: generatedSlug,
            description: eventForm.description.trim() || null,
            banner_url: eventForm.banner_url.trim() || null,
            location_name: eventForm.location_name.trim() || null,
            address: eventForm.address.trim() || null,
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            status: eventForm.status,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new Error(`O slug "${generatedSlug}" já está em uso por outro evento. Escolha um slug diferente.`);
          }
          throw error;
        }

        setSuccessMessage('Evento criado com sucesso! Agora configure os lotes de ingressos.');
        if (data) {
          setSelectedEvent(data as Event);
          loadBatchesForEvent(data.id);
          setView('details');
        }
      }

      await loadEvents();
    } catch (err: any) {
      console.error('Erro ao salvar evento:', err);
      setErrorMessage(err.message || 'Erro ao salvar evento.');
    } finally {
      setSavingEvent(false);
    }
  };

  // Abre modal para novo lote
  const handleOpenNewBatchModal = () => {
    if (!selectedEvent) return;

    const startSales = new Date();
    const endSales = new Date(selectedEvent.start_date);

    setBatchForm({
      name: '1º Lote',
      price: '50.00',
      fee_percentage: '10',
      total_quantity: '100',
      sales_start: startSales.toISOString().slice(0, 16),
      sales_end: endSales.toISOString().slice(0, 16),
      status: 'active',
    });
    setShowBatchModal(true);
  };

  // Salva novo lote
  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;
    setErrorMessage(null);

    const price = parseFloat(batchForm.price);
    const fee = parseFloat(batchForm.fee_percentage);
    const qty = parseInt(batchForm.total_quantity, 10);
    const salesStart = new Date(batchForm.sales_start);
    const salesEnd = new Date(batchForm.sales_end);

    if (isNaN(price) || price < 0) {
      setErrorMessage('Informe um preço válido (maior ou igual a zero).');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      setErrorMessage('Informe uma quantidade de ingressos válida (maior que zero).');
      return;
    }

    if (salesEnd <= salesStart) {
      setErrorMessage('O término das vendas do lote deve ser posterior ao início.');
      return;
    }

    setSavingBatch(true);

    try {
      const { error } = await supabase
        .from('ticket_batches')
        .insert({
          event_id: selectedEvent.id,
          name: batchForm.name.trim(),
          price: Number(price.toFixed(2)),
          fee_percentage: Number(fee.toFixed(2)),
          total_quantity: qty,
          available_quantity: qty, // Lote novo começa com 100% disponível
          sales_start: salesStart.toISOString(),
          sales_end: salesEnd.toISOString(),
          status: batchForm.status,
        });

      if (error) throw error;

      setShowBatchModal(false);
      setSuccessMessage('Lote de ingressos adicionado com sucesso!');
      await loadBatchesForEvent(selectedEvent.id);
    } catch (err: any) {
      console.error('Erro ao criar lote:', err);
      setErrorMessage(err.message || 'Erro ao adicionar lote de ingressos.');
    } finally {
      setSavingBatch(false);
    }
  };

  // Alterna status do lote entre active e paused
  const handleToggleBatchStatus = async (batch: TicketBatch) => {
    const nextStatus = batch.status === 'active' ? 'paused' : 'active';
    try {
      const { error } = await supabase
        .from('ticket_batches')
        .update({ status: nextStatus })
        .eq('id', batch.id);

      if (error) throw error;
      if (selectedEvent) {
        await loadBatchesForEvent(selectedEvent.id);
      }
    } catch (err: any) {
      console.error('Erro ao alternar status do lote:', err);
      alert('Erro ao alterar status do lote: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Alertas globais de feedback */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Aviso</p>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-700 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">Sucesso</p>
            <p className="text-xs mt-0.5">{successMessage}</p>
          </div>
        </div>
      )}

      {/* VISTA 1: LISTAGEM DE EVENTOS */}
      {view === 'list' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900">
                Meus Eventos Cadastrados
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Gerencie as informações públicas, banners e controle os lotes de ingressos.
              </p>
            </div>

            <button
              onClick={handleNewEvent}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Novo Evento</span>
            </button>
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
              <p className="text-xs font-semibold">Carregando seus eventos...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-gray-800">
                Você ainda não possui eventos cadastrados
              </h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1 mb-6">
                Comece agora mesmo criando seu primeiro evento para liberar as vendas de ingressos!
              </p>
              <button
                onClick={handleNewEvent}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow"
              >
                Cadastrar Primeiro Evento
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden">
                      <img
                        src={ev.banner_url || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80'}
                        alt={ev.title}
                        className="w-full h-full object-cover"
                      />
                      <span className={`absolute top-3 right-3 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase shadow-md ${
                        ev.status === 'published'
                          ? 'bg-emerald-500 text-white'
                          : ev.status === 'draft'
                          ? 'bg-amber-500 text-white'
                          : 'bg-rose-500 text-white'
                      }`}>
                        {ev.status === 'published' ? 'Publicado' : ev.status === 'draft' ? 'Rascunho' : 'Cancelado'}
                      </span>
                    </div>

                    <div className="p-5">
                      <h3 className="text-base font-bold text-gray-900 line-clamp-1 mb-1">
                        {ev.title}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <span>{formatShortDate(ev.start_date)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 line-clamp-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span>{ev.location_name || 'Local a confirmar'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleOpenDetails(ev)}
                      className="flex-1 py-2 px-3 bg-white hover:bg-gray-100 border border-gray-200 text-gray-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Ticket className="w-3.5 h-3.5 text-blue-600" />
                      <span>Gerenciar Lotes</span>
                    </button>

                    <Link
                      to={`/portaria/${ev.id}`}
                      className="p-2 bg-slate-900 hover:bg-black text-white rounded-xl transition"
                      title="Abrir Modo Portaria (Leitor QR)"
                    >
                      <Camera className="w-4 h-4 text-blue-400" />
                    </Link>

                    <button
                      onClick={() => handleEditEvent(ev)}
                      className="p-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl transition"
                      title="Editar Informações"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {ev.status === 'published' && (
                      <Link
                        to={`/evento/${ev.slug}`}
                        target="_blank"
                        className="p-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl transition"
                        title="Ver Página Pública"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: FORMULÁRIO DE CRIAR / EDITAR EVENTO */}
      {view === 'form' && (
        <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView('list')}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {eventForm.id ? 'Editar Evento' : 'Criar Novo Evento'}
                </h2>
                <p className="text-xs text-gray-500">
                  Preencha as informações do evento para publicação.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveEvent} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Título do Evento *
              </label>
              <input
                type="text"
                required
                value={eventForm.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setEventForm((prev) => ({
                    ...prev,
                    title: val,
                    slug: prev.id ? prev.slug : slugify(val),
                  }));
                }}
                placeholder="Ex: Show do Metallica SP 2026"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Slug (URL Amigável) *
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-xs text-gray-500 font-mono">
                  /evento/
                </span>
                <input
                  type="text"
                  required
                  value={eventForm.slug}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, slug: slugify(e.target.value) }))
                  }
                  placeholder="show-do-metallica-sp-2026"
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-r-xl text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                URL do Banner / Imagem de Divulgação
              </label>
              <div className="relative">
                <ImageIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="url"
                  value={eventForm.banner_url}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, banner_url: e.target.value }))
                  }
                  placeholder="https://images.unsplash.com/..."
                  className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Nome do Local *
                </label>
                <input
                  type="text"
                  required
                  value={eventForm.location_name}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, location_name: e.target.value }))
                  }
                  placeholder="Ex: Allianz Parque"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={eventForm.address}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="Ex: Av. Francisco Matarazzo, 1705 - Água Branca, SP"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Início do Evento *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={eventForm.start_date}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, start_date: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Término do Evento *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={eventForm.end_date}
                  onChange={(e) =>
                    setEventForm((prev) => ({ ...prev, end_date: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Descrição Completa
              </label>
              <textarea
                rows={4}
                value={eventForm.description}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Detalhes, regras de entrada, classificação indicativa..."
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Status de Publicação *
              </label>
              <select
                value={eventForm.status}
                onChange={(e) =>
                  setEventForm((prev) => ({ ...prev, status: e.target.value as EventStatus }))
                }
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition font-semibold"
              >
                <option value="draft">Rascunho (Privado, não aparece na vitrine)</option>
                <option value="published">Publicado (Disponível para venda na vitrine pública)</option>
                <option value="cancelled">Cancelado</option>
                <option value="finished">Encerrado</option>
              </select>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setView('list')}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEvent}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow flex items-center gap-2 disabled:opacity-50"
              >
                {savingEvent ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <span>Salvar Evento</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VISTA 3: DETALHES DO EVENTO & GERENCIADOR DE LOTES */}
      {view === 'details' && selectedEvent && (
        <div className="space-y-6">
          {/* Header do Evento Selecionado */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setView('list')}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedEvent.title}
                  </h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    selectedEvent.status === 'published'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {selectedEvent.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatFullDate(selectedEvent.start_date)} • {selectedEvent.location_name}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/portaria/${selectedEvent.id}`}
                className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow"
              >
                <Camera className="w-3.5 h-3.5 text-blue-400" />
                <span>Abrir Modo Portaria (Leitor QR)</span>
              </Link>
              <Link
                to={`/evento/${selectedEvent.slug}`}
                target="_blank"
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Ver Vitrine</span>
              </Link>
              <button
                onClick={() => handleEditEvent(selectedEvent)}
                className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar Dados</span>
              </button>
              <button
                onClick={handleOpenNewBatchModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Lote</span>
              </button>
            </div>
          </div>

          {/* Gerenciador de Lotes (ticket_batches) */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Lotes de Ingressos e Estoque Atômico
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Estoque protegido por <code>SELECT FOR UPDATE</code> no Supabase contra overselling.
                </p>
              </div>
              <span className="text-xs font-bold text-gray-500">
                {batches.length} {batches.length === 1 ? 'lote' : 'lotes'}
              </span>
            </div>

            {batches.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl p-6">
                <Ticket className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-gray-700">Nenhum lote criado</h4>
                <p className="text-xs text-gray-500 mb-4">
                  Crie pelo menos um lote ativo para que os compradores possam selecionar ingressos.
                </p>
                <button
                  onClick={handleOpenNewBatchModal}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow"
                >
                  Criar Primeiro Lote
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {batches.map((batch) => {
                  const sold = batch.total_quantity - batch.available_quantity;
                  const soldPercent = batch.total_quantity > 0
                    ? Math.round((sold / batch.total_quantity) * 100)
                    : 0;

                  const isPaused = batch.status === 'paused';
                  const isSoldOut = batch.available_quantity <= 0 || batch.status === 'sold_out';

                  return (
                    <div
                      key={batch.id}
                      className="p-5 rounded-2xl border border-gray-200 bg-gray-50/50 hover:bg-white hover:border-blue-200 hover:shadow-sm transition space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-gray-900">
                              {batch.name}
                            </h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              isSoldOut
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : isPaused
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {isSoldOut ? 'Esgotado' : isPaused ? 'Pausado' : 'Ativo'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">
                            Vendas: {formatShortDate(batch.sales_start)} até {formatShortDate(batch.sales_end)}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-base font-extrabold text-blue-600 block">
                              {formatCurrency(batch.price)}
                            </span>
                            <span className="text-[10px] text-gray-500 font-medium">
                              Taxa: {batch.fee_percentage}% ({formatCurrency((batch.price * batch.fee_percentage) / 100)})
                            </span>
                          </div>

                          <button
                            onClick={() => handleToggleBatchStatus(batch)}
                            className={`p-2 rounded-xl border text-xs font-semibold transition flex items-center gap-1 ${
                              isPaused
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            }`}
                            title={isPaused ? 'Ativar Vendas' : 'Pausar Vendas'}
                          >
                            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Barra de Progresso de Vendas */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1 font-medium">
                          <span>
                            Vendidos: <strong>{sold}</strong> / {batch.total_quantity}
                          </span>
                          <span>
                            Disponíveis: <strong>{batch.available_quantity}</strong> ({soldPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all duration-500 ${
                              soldPercent >= 90 ? 'bg-rose-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, soldPercent)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL PARA ADICIONAR NOVO LOTE */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-100 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                Novo Lote de Ingressos
              </h3>
              <button
                onClick={() => setShowBatchModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Nome do Lote *
                </label>
                <input
                  type="text"
                  required
                  value={batchForm.name}
                  onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                  placeholder="Ex: 1º Lote — Pista"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Preço (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={batchForm.price}
                    onChange={(e) => setBatchForm({ ...batchForm, price: e.target.value })}
                    placeholder="80.00"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Taxa (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    value={batchForm.fee_percentage}
                    onChange={(e) => setBatchForm({ ...batchForm, fee_percentage: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Quantidade Total de Ingressos *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={batchForm.total_quantity}
                  onChange={(e) => setBatchForm({ ...batchForm, total_quantity: e.target.value })}
                  placeholder="100"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Início das Vendas *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={batchForm.sales_start}
                    onChange={(e) => setBatchForm({ ...batchForm, sales_start: e.target.value })}
                    className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-600 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Fim das Vendas *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={batchForm.sales_end}
                    onChange={(e) => setBatchForm({ ...batchForm, sales_end: e.target.value })}
                    className="w-full px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-600 transition"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow disabled:opacity-50"
                >
                  {savingBatch ? 'Salvando...' : 'Adicionar Lote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

