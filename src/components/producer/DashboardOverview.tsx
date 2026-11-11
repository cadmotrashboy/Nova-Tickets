import React, { useEffect, useState } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Ticket, 
  UserCheck, 
  Calendar, 
  ArrowUpRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  PlusCircle,
  Percent
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Organizer, Event, Order, Ticket as TicketType, TicketBatch } from '../../types/database';
import { formatCurrency, formatShortDate } from '../../utils/formatters';

interface DashboardOverviewProps {
  organizer: Organizer;
  onNavigateToTab: (tab: string) => void;
}

interface OverviewMetrics {
  totalNetRevenue: number;
  totalPlatformFee: number;
  totalTicketsSold: number;
  totalCapacity: number;
  totalCheckins: number;
  paidOrdersCount: number;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ organizer, onNavigateToTab }) => {
  const [metrics, setMetrics] = useState<OverviewMetrics>({
    totalNetRevenue: 0,
    totalPlatformFee: 0,
    totalTicketsSold: 0,
    totalCapacity: 0,
    totalCheckins: 0,
    paidOrdersCount: 0,
  });

  const [recentOrders, setRecentOrders] = useState<(Order & { events?: Event; profiles?: any })[]>([]);
  const [eventsList, setEventsList] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadOverviewData();
  }, [organizer.id]);

  const loadOverviewData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!isSupabaseConfigured) {
        // Fallback local se não conectado
        setMetrics({
          totalNetRevenue: 12450.00,
          totalPlatformFee: 1380.00,
          totalTicketsSold: 185,
          totalCapacity: 400,
          totalCheckins: 42,
          paidOrdersCount: 88,
        });
        setLoading(false);
        return;
      }

      // 1. Busca todos os eventos deste organizador
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('organizer_id', organizer.id);

      if (eventsError) {
        throw new Error(eventsError.message);
      }

      const eventIds = (events || []).map((e) => e.id);
      setEventsList(events || []);

      if (eventIds.length === 0) {
        setLoading(false);
        return;
      }

      // 2. Busca lotes de ingressos para calcular a capacidade total
      const { data: batches } = await supabase
        .from('ticket_batches')
        .select('*')
        .in('event_id', eventIds);

      const totalCap = (batches || []).reduce((acc, b) => acc + (b.total_quantity || 0), 0);

      // 3. Busca pedidos com status 'paid' vinculados aos eventos do organizador
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*, events (*)')
        .in('event_id', eventIds)
        .eq('status', 'paid')
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.warn('Aviso ao carregar pedidos:', ordersError);
      }

      const paidOrders = orders || [];
      const netRevenue = paidOrders.reduce((acc, o) => acc + Number(o.organizer_amount || 0), 0);
      const platformFee = paidOrders.reduce((acc, o) => acc + Number(o.platform_fee_amount || 0), 0);

      // 4. Busca tickets para contagem de ingressos emitidos e check-ins realizados
      const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('id, status, checked_in_at')
        .in('event_id', eventIds);

      if (ticketsError) {
        console.warn('Aviso ao carregar tickets:', ticketsError);
      }

      const allTickets = tickets || [];
      const checkinCount = allTickets.filter((t) => t.status === 'used').length;
      const ticketsSold = allTickets.length;

      setMetrics({
        totalNetRevenue: netRevenue,
        totalPlatformFee: platformFee,
        totalTicketsSold: ticketsSold,
        totalCapacity: totalCap,
        totalCheckins: checkinCount,
        paidOrdersCount: paidOrders.length,
      });

      setRecentOrders(paidOrders.slice(0, 5) as any);
    } catch (err: any) {
      console.error('Erro ao carregar métricas do dashboard:', err);
      setErrorMessage(err.message || 'Erro ao carregar métricas.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-semibold">Carregando métricas da sua produtora...</p>
      </div>
    );
  }

  const occupancyRate = metrics.totalCapacity > 0
    ? Math.round((metrics.totalTicketsSold / metrics.totalCapacity) * 100)
    : 0;

  const checkinRate = metrics.totalTicketsSold > 0
    ? Math.round((metrics.totalCheckins / metrics.totalTicketsSold) * 100)
    : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Aviso ao calcular métricas</p>
            <p className="text-xs mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Header com saudação e ação primária */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
            Visão Geral em Tempo Real
          </span>
          <h1 className="text-2xl font-extrabold text-gray-900 mt-2">
            Olá, {organizer.company_name}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Documento: {organizer.document} • Chave Pix: {organizer.pix_key || 'Não cadastrada'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateToTab('events_new')}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Criar Novo Evento</span>
          </button>
        </div>
      </div>

      {/* Grid de 4 Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* 1. Receita Líquida do Produtor */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Receita Líquida
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-gray-900">
            {formatCurrency(metrics.totalNetRevenue)}
          </div>
          <p className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Líquido a receber via Pix</span>
          </p>
        </div>

        {/* 2. Taxas da Plataforma */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Taxas da Plataforma
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-gray-900">
            {formatCurrency(metrics.totalPlatformFee)}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            {metrics.paidOrdersCount} pedidos confirmados
          </p>
        </div>

        {/* 3. Ingressos Vendidos vs. Capacidade */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Ingressos Vendidos
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Ticket className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-gray-900">
            {metrics.totalTicketsSold} <span className="text-sm font-medium text-gray-400">/ {metrics.totalCapacity}</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, occupancyRate)}%` }}
            />
          </div>
          <p className="text-[11px] text-indigo-600 font-semibold mt-1.5">
            {occupancyRate}% da capacidade total
          </p>
        </div>

        {/* 4. Check-ins Realizados */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Check-ins Efetuados
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-gray-900">
            {metrics.totalCheckins} <span className="text-sm font-medium text-gray-400">validados</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
            <div
              className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, checkinRate)}%` }}
            />
          </div>
          <p className="text-[11px] text-amber-600 font-semibold mt-1.5">
            {checkinRate}% dos compradores já entraram
          </p>
        </div>
      </div>

      {/* Seção Inferior: Últimos Pedidos e Atalhos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Tabela dos Últimos Pedidos (2 colunas) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <h3 className="text-base font-bold text-gray-900">
                Últimos Pedidos Confirmados
              </h3>
            </div>
            <button
              onClick={() => onNavigateToTab('attendees')}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
            >
              <span>Ver todos os participantes</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">
              Nenhum pedido pago registrado ainda. Divulgue seus eventos para começar a vender!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-semibold">
                    <th className="pb-3">Pedido</th>
                    <th className="pb-3">Evento</th>
                    <th className="pb-3">Valor Líquido</th>
                    <th className="pb-3">Data</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-gray-50/60 transition">
                      <td className="py-3 font-mono font-bold text-gray-700">
                        #{ord.id.slice(0, 8)}
                      </td>
                      <td className="py-3 text-gray-800 font-semibold max-w-[180px] truncate">
                        {ord.events?.title || 'Evento'}
                      </td>
                      <td className="py-3 font-bold text-emerald-600">
                        {formatCurrency(ord.organizer_amount)}
                      </td>
                      <td className="py-3 text-gray-500">
                        {formatShortDate(ord.created_at)}
                      </td>
                      <td className="py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" /> Pago
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Card Lateral: Seus Eventos Ativos */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900">Seus Eventos</h3>
            <span className="text-xs text-gray-500 font-semibold">
              {eventsList.length} cadastrados
            </span>
          </div>

          <div className="space-y-3">
            {eventsList.slice(0, 4).map((ev) => (
              <div
                key={ev.id}
                onClick={() => onNavigateToTab(`event_${ev.id}`)}
                className="p-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/30 transition cursor-pointer flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <h4 className="text-xs font-bold text-gray-900 truncate">
                    {ev.title}
                  </h4>
                  <span className="text-[10px] text-gray-500 block mt-0.5">
                    {formatShortDate(ev.start_date)}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  ev.status === 'published'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {ev.status === 'published' ? 'Publicado' : ev.status}
                </span>
              </div>
            ))}

            {eventsList.length === 0 && (
              <div className="text-center py-6 text-gray-400 text-xs">
                Nenhum evento criado ainda.
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigateToTab('events')}
            className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 transition block text-center"
          >
            Gerenciar Todos os Eventos
          </button>
        </div>
      </div>
    </div>
  );
};
