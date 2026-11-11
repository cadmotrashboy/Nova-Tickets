import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Calendar, 
  MapPin, 
  Share2, 
  Clock, 
  ShieldCheck, 
  Plus, 
  Minus, 
  Ticket, 
  ArrowLeft, 
  AlertCircle,
  Loader2,
  CheckCircle2,
  Info
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Event, TicketBatch } from '../types/database';
import { useCartStore } from '../store/useCartStore';
import { useAuth } from '../context/AuthContext';
import { formatFullDate, formatCurrency } from '../utils/formatters';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { AuthModal } from '../components/AuthModal';

// Lotes mock para fallback em dev caso a tabela de lotes ainda não tenha dados
const DEMO_BATCHES: Record<string, TicketBatch[]> = {
  'festival-sonora-beats-2026': [
    {
      id: 'b1111111-1111-1111-1111-111111111111',
      event_id: 'e1111111-1111-1111-1111-111111111111',
      name: '1º Lote — Pista Promocional',
      price: 80.0,
      fee_percentage: 10.0,
      total_quantity: 500,
      available_quantity: 120,
      sales_start: '2026-10-01T00:00:00Z',
      sales_end: '2026-11-20T17:00:00Z',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'b2222222-2222-2222-2222-222222222222',
      event_id: 'e1111111-1111-1111-1111-111111111111',
      name: '1º Lote — Área VIP Open Bar',
      price: 180.0,
      fee_percentage: 10.0,
      total_quantity: 200,
      available_quantity: 35,
      sales_start: '2026-10-01T00:00:00Z',
      sales_end: '2026-11-20T17:00:00Z',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'b3333333-3333-3333-3333-333333333333',
      event_id: 'e1111111-1111-1111-1111-111111111111',
      name: 'Backstage Experience + Acesso Palco',
      price: 350.0,
      fee_percentage: 8.0,
      total_quantity: 50,
      available_quantity: 5,
      sales_start: '2026-10-01T00:00:00Z',
      sales_end: '2026-11-20T17:00:00Z',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

export const EventDetailsPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [batches, setBatches] = useState<TicketBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { items, setQuantity, clearCart, setEventId, getTotalCount, getSubtotal, getTotalFee, getTotalAmount, getItemsPayload } = useCartStore();

  useEffect(() => {
    if (slug) {
      loadEventAndBatches(slug);
    }
  }, [slug]);

  const loadEventAndBatches = async (eventSlug: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      if (!isSupabaseConfigured) {
        // Fallback offline/demo
        loadMockData(eventSlug);
        setLoading(false);
        return;
      }

      // 1. Busca dados do evento no Supabase por slug
      const { data: rawEventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('slug', eventSlug)
        .single();

      const eventData = rawEventData as Event | null;

      if (eventError || !eventData) {
        console.warn('Evento não encontrado no Supabase, usando fallback se disponível:', eventError);
        loadMockData(eventSlug);
        setLoading(false);
        return;
      }

      setEvent(eventData);
      setEventId(eventData.id);

      // 2. Busca lotes de ingressos ativos do evento
      const { data: rawBatchData, error: batchError } = await supabase
        .from('ticket_batches')
        .select('*')
        .eq('event_id', eventData.id)
        .order('price', { ascending: true });

      const batchData = rawBatchData as TicketBatch[] | null;

      if (batchError || !batchData || batchData.length === 0) {
        // Caso o evento exista mas não tenha lotes criados ainda
        if (DEMO_BATCHES[eventSlug]) {
          setBatches(DEMO_BATCHES[eventSlug]);
        } else {
          setBatches([]);
        }
      } else {
        setBatches(batchData as TicketBatch[]);
      }
    } catch (err: any) {
      console.error('Erro ao carregar evento:', err);
      loadMockData(eventSlug);
    } finally {
      setLoading(false);
    }
  };

  const loadMockData = (eventSlug: string) => {
    const mockEvent: Event = {
      id: 'e1111111-1111-1111-1111-111111111111',
      organizer_id: 'org-1',
      title: 'Festival Sonora Beats 2026',
      slug: eventSlug,
      description: `O Sonora Beats 2026 reunirá os maiores expoentes da música eletrônica mundial em um espetáculo audiovisual inédito.
      
Informações Importantes:
• Classificação indicativa: 18 anos.
• Obrigatória a apresentação de documento oficial com foto e QR Code do ingresso.
• Estacionamento no local com vagas limitadas.
• Área gastronômica com food trucks variados.`,
      banner_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
      location_name: 'Parque Ibirapuera - Pavilhão das Artes',
      address: 'Av. Pedro Álvares Cabral, s/n - Vila Mariana, São Paulo - SP',
      start_date: '2026-11-20T18:00:00-03:00',
      end_date: '2026-11-21T06:00:00-03:00',
      status: 'published',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setEvent(mockEvent);
    setEventId(mockEvent.id);
    setBatches(DEMO_BATCHES['festival-sonora-beats-2026'] || []);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleProceedToCheckout = async () => {
    if (!event) return;
    const totalCount = getTotalCount();
    if (totalCount === 0) {
      setErrorMessage('Selecione pelo menos um ingresso para continuar.');
      return;
    }

    // 1. Checa autenticação: Se não logado, abre modal de login rápido
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setReserving(true);
    setErrorMessage(null);

    const payload = getItemsPayload();

    try {
      if (!isSupabaseConfigured) {
        // Simulação offline/dev quando não há Supabase conectado
        const mockOrderId = `ord-${Date.now()}`;
        // Armazena no sessionStorage para o checkout carregar
        sessionStorage.setItem(`order_${mockOrderId}`, JSON.stringify({
          order: {
            id: mockOrderId,
            user_id: user.id,
            event_id: event.id,
            total_amount: getTotalAmount(),
            platform_fee_amount: getTotalFee(),
            organizer_amount: getSubtotal(),
            status: 'pending',
            pix_qr_code: null,
            pix_copy_paste: '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865405' + getTotalAmount().toFixed(2) + '5802BR5925NOVA TICKETS INGRESSOS6009SAO PAULO62070503***6304ABCD',
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          items: Object.values(items).map((item) => ({
            id: `item-${Math.random()}`,
            order_id: mockOrderId,
            batch_id: item.batch.id,
            quantity: item.quantity,
            unit_price: item.batch.price,
            batch: item.batch,
          })),
          event,
        }));

        navigate(`/checkout/${mockOrderId}`);
        return;
      }

      // 2. Chama a função RPC oficial do Supabase: reserve_tickets
      const { data: orderId, error: rpcError } = await (supabase.rpc as any)('reserve_tickets', {
        p_user_id: user.id,
        p_event_id: event.id,
        p_items: payload,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Falha ao reservar ingressos.');
      }

      if (!orderId) {
        throw new Error('Não foi possível gerar a reserva de ingressos.');
      }

      // Limpa carrinho e redireciona imediatamente para o checkout
      navigate(`/checkout/${orderId}`);
    } catch (err: any) {
      console.error('Erro na reserva:', err);
      setErrorMessage(
        err.message || 'Ocorreu um erro ao processar sua reserva. Verifique o estoque disponível.'
      );
    } finally {
      setReserving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <p className="text-base font-semibold">Carregando detalhes do evento...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <div className="flex-1 max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Evento não encontrado</h2>
          <p className="text-sm text-gray-500 mb-6">
            O evento solicitado pode ter sido despublicado ou o endereço está incorreto.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar para a página inicial</span>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const totalCount = getTotalCount();
  const subtotal = getSubtotal();
  const totalFee = getTotalFee();
  const totalAmount = getTotalAmount();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 pb-24 md:pb-12">
      <Navbar />

      {/* Breadcrumb / Top Bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-blue-600 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Todos os Eventos</span>
          </Link>

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-blue-600 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 transition"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{copiedLink ? 'Link Copiado!' : 'Compartilhar'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm shadow-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Aviso na Reserva</p>
              <p className="text-xs mt-0.5 text-red-600">{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Coluna Esquerda: Banner & Detalhes do Evento (7 colunas no desktop) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Banner com bordas arredondadas e sombra */}
            <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden shadow-md bg-gray-900 border border-gray-200">
              <img
                src={
                  event.banner_url ||
                  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80'
                }
                alt={event.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Informações Principais */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  Evento Confirmado
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-3 leading-tight">
                  {event.title}
                </h1>
              </div>

              {/* Data & Local */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-y border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-gray-600 font-semibold uppercase tracking-wider block">
                      Data e Horário
                    </span>
                    <span className="text-sm font-bold text-gray-900 capitalize">
                      {formatFullDate(event.start_date)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs text-gray-600 font-semibold uppercase tracking-wider block">
                      Local
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {event.location_name || 'Local informado pelo organizador'}
                    </span>
                    {event.address && (
                      <span className="text-xs text-gray-600 block mt-0.5">
                        {event.address}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Descrição do Evento */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-3">Sobre o Evento</h3>
                <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed whitespace-pre-line text-sm">
                  {event.description || 'Nenhuma descrição fornecida pelo organizador.'}
                </div>
              </div>

              {/* Garantias & Segurança */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
                <ShieldCheck className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div className="text-xs text-slate-600">
                  <span className="font-bold text-slate-900 block">Compra 100% Segura e Oficial</span>
                  Seus ingressos ficam salvos em sua conta e possuem autenticação por QR Code criptografado.
                </div>
              </div>
            </div>
          </div>

          {/* Coluna Direita: Card Flutuante de Seleção de Ingressos (5 colunas no desktop) */}
          <div className="lg:col-span-5 sticky top-28 space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
              {/* Header do Card */}
              <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-blue-50/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-bold text-gray-900">Selecione seus Ingressos</h2>
                  </div>
                  <span className="text-xs font-semibold text-gray-500">
                    {batches.length} {batches.length === 1 ? 'lote ativo' : 'lotes ativos'}
                  </span>
                </div>
              </div>

              {/* Lista de Lotes */}
              <div className="p-5 divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
                {batches.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Nenhum lote de ingresso disponível no momento.
                  </div>
                ) : (
                  batches.map((batch) => {
                    const selectedQty = items[batch.id]?.quantity || 0;
                    const isSoldOut = batch.available_quantity <= 0 || batch.status === 'sold_out';
                    const feeAmount = (batch.price * (batch.fee_percentage || 0)) / 100;

                    return (
                      <div key={batch.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 leading-snug">
                              {batch.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-base font-extrabold text-blue-600">
                                {formatCurrency(batch.price)}
                              </span>
                              {batch.fee_percentage > 0 && (
                                <span className="text-xs text-gray-400 font-medium">
                                  (+ {formatCurrency(feeAmount)} taxa)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Seletor de Quantidade (+ / -) */}
                          {isSoldOut ? (
                            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                              Esgotado
                            </span>
                          ) : (
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-1 shadow-inner">
                              <button
                                type="button"
                                disabled={selectedQty <= 0}
                                onClick={() => setQuantity(batch, selectedQty - 1)}
                                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:text-blue-600 hover:border-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>

                              <span className="w-6 text-center text-sm font-bold text-gray-900">
                                {selectedQty}
                              </span>

                              <button
                                type="button"
                                disabled={selectedQty >= batch.available_quantity || selectedQty >= 10}
                                onClick={() => setQuantity(batch, selectedQty + 1)}
                                className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:text-blue-600 hover:border-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Estoque disponível aviso */}
                        {!isSoldOut && batch.available_quantity <= 15 && (
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 mt-1">
                            <Clock className="w-3 h-3" />
                            <span>Restam apenas {batch.available_quantity} ingressos!</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Resumo Financeiro */}
              <div className="p-5 bg-gray-50 border-t border-gray-100 space-y-2.5">
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Subtotal ({totalCount} {totalCount === 1 ? 'ingresso' : 'ingressos'})</span>
                  <span className="font-semibold text-gray-800">{formatCurrency(subtotal)}</span>
                </div>

                <div className="flex justify-between text-xs text-gray-600">
                  <span>Taxa de serviço da plataforma</span>
                  <span className="font-semibold text-gray-800">{formatCurrency(totalFee)}</span>
                </div>

                <div className="pt-2 border-t border-gray-200 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-gray-900">Valor Total</span>
                  <span className="text-xl font-extrabold text-blue-600">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>

                {/* Botão de Compra Desktop */}
                <button
                  type="button"
                  disabled={totalCount === 0 || reserving}
                  onClick={handleProceedToCheckout}
                  className="w-full mt-4 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {reserving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Garantindo sua reserva...</span>
                    </>
                  ) : (
                    <>
                      <Ticket className="w-4 h-4" />
                      <span>{user ? 'Comprar Ingressos' : 'Entrar e Comprar Ingressos'}</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-gray-600 text-center flex items-center justify-center gap-1 pt-1">
                  <Clock className="w-3 h-3" /> Ingressos reservados por 10 minutos após clicar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Barra Fixa Inferior Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t border-gray-200 p-4 shadow-2xl flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-bold text-gray-600 block">Total ({totalCount})</span>
          <span className="text-lg font-extrabold text-blue-600">{formatCurrency(totalAmount)}</span>
        </div>

        <button
          type="button"
          disabled={totalCount === 0 || reserving}
          onClick={handleProceedToCheckout}
          className="py-3 px-6 bg-blue-600 text-white rounded-xl font-bold text-sm shadow disabled:opacity-50 flex items-center gap-2"
        >
          {reserving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <span>Avançar</span>
              <Ticket className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      <Footer />

      {/* Modal de Autenticação Rápida */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={() => {
          // Após logar com sucesso, chama a reserva automaticamente
          setTimeout(() => {
            handleProceedToCheckout();
          }, 300);
        }}
        title="Quase lá! Faça login para continuar"
        subtitle="Seus ingressos serão associados ao seu e-mail e emitidos com QR Code exclusivo."
      />
    </div>
  );
};
