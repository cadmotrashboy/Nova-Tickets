import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Copy, 
  Check, 
  QrCode, 
  User, 
  Mail, 
  FileText, 
  ShieldCheck, 
  ArrowLeft, 
  Loader2, 
  Sparkles,
  Zap,
  Ticket
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Order, OrderItem, Event, TicketBatch, AttendeePayload } from '../types/database';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatCPF, formatShortDate } from '../utils/formatters';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

interface OrderItemWithDetails extends OrderItem {
  batch?: TicketBatch;
}

interface FormAttendee {
  name: string;
  cpf: string;
  email: string;
}

export const CheckoutPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemWithDetails[]>([]);
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  
  // Controle de etapas: 1 = Formulário de Participantes, 2 = Pagamento Pix
  const [step, setStep] = useState<'attendees' | 'pix'>('attendees');

  // Participantes por ingresso: indexado por `${item.batch_id}_${attendeeIndex}`
  const [attendeesMap, setAttendeesMap] = useState<Record<string, FormAttendee>>({});
  const [copiedPix, setCopiedPix] = useState(false);
  const [simulatingPayment, setSimulatingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // 1. Carrega dados da Order e Order Items
  useEffect(() => {
    if (orderId) {
      loadOrderData(orderId);
    }
  }, [orderId]);

  const loadOrderData = async (id: string) => {
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Fallback para sessão local simulada
        const saved = sessionStorage.getItem(`order_${id}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          setOrder(parsed.order);
          setOrderItems(parsed.items);
          setEvent(parsed.event);
          initAttendees(parsed.items);
          setLoading(false);
          return;
        }
      }

      // Busca o pedido no Supabase
      const { data: rawOrderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single();

      const orderData = rawOrderData as Order | null;

      if (orderError || !orderData) {
        throw new Error(orderError?.message || 'Pedido não encontrado.');
      }

      setOrder(orderData);

      // Se o pedido já estiver pago, redireciona para meus ingressos
      if (orderData.status === 'paid') {
        navigate('/meus-ingressos');
        return;
      }

      // Se expirado
      if (orderData.status === 'expired') {
        setIsExpired(true);
      }

      // Busca dados do evento
      const { data: rawEventData } = await supabase
        .from('events')
        .select('*')
        .eq('id', orderData.event_id)
        .single();

      if (rawEventData) {
        setEvent(rawEventData as Event);
      }

      // Busca itens do pedido com os lotes correspondentes
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*, ticket_batches(*)')
        .eq('order_id', id);

      if (!itemsError && itemsData) {
        const enrichedItems: OrderItemWithDetails[] = itemsData.map((it: any) => ({
          ...it,
          batch: it.ticket_batches,
        }));
        setOrderItems(enrichedItems);
        initAttendees(enrichedItems);
      }
    } catch (err: any) {
      console.error('Erro ao carregar checkout:', err);
    } finally {
      setLoading(false);
    }
  };

  // Inicializa o formulário de participantes com dados padrão do titular logado
  const initAttendees = (items: OrderItemWithDetails[]) => {
    const initial: Record<string, FormAttendee> = {};
    let isFirst = true;

    items.forEach((item) => {
      for (let i = 0; i < item.quantity; i++) {
        const key = `${item.batch_id}_${i}`;
        if (isFirst && user) {
          // O 1º ingresso preenche por padrão com os dados do usuário autenticado
          initial[key] = {
            name: profile?.full_name || '',
            cpf: profile?.cpf || '',
            email: user.email || '',
          };
          isFirst = false;
        } else {
          initial[key] = {
            name: '',
            cpf: '',
            email: '',
          };
        }
      }
    });

    setAttendeesMap(initial);
  };

  // 2. Cronômetro regressivo baseado no order.expires_at
  useEffect(() => {
    if (!order?.expires_at) return;

    const targetTime = new Date(order.expires_at).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setTimeLeftMs(0);
        setIsExpired(true);
      } else {
        setTimeLeftMs(diff);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [order?.expires_at]);

  // 3. Supabase Realtime Subscription para escutar status 'paid'
  useEffect(() => {
    if (!orderId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const updated = payload.new as Order;
          setOrder(updated);

          if (updated.status === 'paid') {
            // Pagamento confirmado em tempo real! Redireciona com feedback
            navigate('/meus-ingressos', { state: { paymentSuccess: true } });
          } else if (updated.status === 'expired') {
            setIsExpired(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, navigate]);

  // Formata o tempo restante (MM:SS)
  const formattedTimer = useMemo(() => {
    if (timeLeftMs === null) return '10:00';
    if (timeLeftMs <= 0) return '00:00';

    const totalSeconds = Math.floor(timeLeftMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [timeLeftMs]);

  // Pix Copia e Cola gerado
  const pixCopyPasteCode = useMemo(() => {
    if (order?.pix_copy_paste) return order.pix_copy_paste;
    const amountStr = (order?.total_amount || 0).toFixed(2);
    return `00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865405${amountStr}5802BR5925NOVA TICKETS INGRESSOS6009SAO PAULO62070503***6304ABCD`;
  }, [order]);

  const handleCopyPix = () => {
    navigator.clipboard.writeText(pixCopyPasteCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const handleAttendeeChange = (key: string, field: keyof FormAttendee, val: string) => {
    setAttendeesMap((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: field === 'cpf' ? formatCPF(val) : val,
      },
    }));
  };

  const validateAttendees = (): boolean => {
    for (const item of orderItems) {
      for (let i = 0; i < item.quantity; i++) {
        const key = `${item.batch_id}_${i}`;
        const data = attendeesMap[key];
        if (!data || !data.name.trim() || !data.cpf.trim() || !data.email.trim()) {
          setPaymentError('Por favor, preencha todos os dados dos participantes antes de prosseguir.');
          return false;
        }
      }
    }
    setPaymentError(null);
    return true;
  };

  const buildAttendeesPayload = (): AttendeePayload[] => {
    return orderItems.map((item) => {
      const attendees = [];
      for (let i = 0; i < item.quantity; i++) {
        const key = `${item.batch_id}_${i}`;
        const data = attendeesMap[key] || { name: 'Participante', cpf: '000.000.000-00', email: 'user@email.com' };
        attendees.push({
          name: data.name,
          cpf: data.cpf,
          email: data.email,
        });
      }
      return {
        batch_id: item.batch_id,
        attendees,
      };
    });
  };

  // 4. Simulação de Confirmação de Pagamento (Ambiente Dev)
  const handleSimulatePayment = async () => {
    if (!order) return;
    if (!validateAttendees()) return;

    setSimulatingPayment(true);
    setPaymentError(null);

    const attendeesPayload = buildAttendeesPayload();

    try {
      if (!isSupabaseConfigured) {
        // Fallback local
        const mockTickets = attendeesPayload.flatMap((group) =>
          group.attendees.map((att, idx) => ({
            id: `tick-${Date.now()}-${idx}`,
            order_id: order.id,
            event_id: order.event_id,
            batch_id: group.batch_id,
            owner_name: att.name,
            owner_cpf: att.cpf,
            owner_email: att.email,
            qr_code_hash: `HMAC_SHA256_HASH_${Date.now()}_${idx}`,
            status: 'valid',
            checked_in_at: null,
            checked_in_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            event,
            batch: orderItems.find((i) => i.batch_id === group.batch_id)?.batch,
          }))
        );

        localStorage.setItem(`tickets_user_${order.user_id}`, JSON.stringify(mockTickets));
        navigate('/meus-ingressos', { state: { paymentSuccess: true } });
        return;
      }

      // Invoca a função RPC oficial do Supabase: confirm_order_payment
      const { data: success, error: rpcError } = await (supabase.rpc as any)('confirm_order_payment', {
        p_order_id: order.id,
        p_attendees: attendeesPayload,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Erro ao confirmar pagamento.');
      }

      // Redireciona para Meus Ingressos
      navigate('/meus-ingressos', { state: { paymentSuccess: true } });
    } catch (err: any) {
      console.error('Erro na simulação do pagamento:', err);
      setPaymentError(err.message || 'Erro ao processar pagamento.');
    } finally {
      setSimulatingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center py-24 text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
          <p className="text-base font-semibold">Carregando dados da sua reserva...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <div className="flex-1 max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Pedido não encontrado</h2>
          <p className="text-sm text-gray-500 mb-6">
            O pedido solicitado não foi localizado ou não pertence à sua conta.
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

  // Se a reserva expirou
  if (isExpired) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Navbar />
        <div className="flex-1 max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner">
            <Clock className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">Tempo de Reserva Expirado</h2>
          <p className="text-sm text-gray-600 mb-8 leading-relaxed">
            O prazo de 10 minutos para concluir o pagamento expirou e os ingressos foram devolvidos ao estoque para outros compradores.
          </p>
          <Link
            to={event ? `/evento/${event.slug}` : '/'}
            className="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm shadow-md transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar e Selecionar Ingressos Novamente</span>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      {/* Cronômetro Regressivo Sticky no Topo */}
      <div className="sticky top-20 z-30 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white py-3.5 px-4 shadow-md border-b border-blue-900/40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg">
              <Clock className="w-4 h-4 animate-pulse" />
            </span>
            <div>
              <span className="text-xs text-slate-300 font-medium block">
                Seus ingressos estão reservados por:
              </span>
              <span className="text-xs text-blue-300 font-semibold hidden sm:inline">
                Conclua o pagamento antes do tempo expirar.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-black/40 border border-white/10 px-4 py-1.5 rounded-xl font-mono text-xl sm:text-2xl font-extrabold tracking-wider text-amber-400 shadow-inner">
            {formattedTimer}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        
        {paymentError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Atenção</p>
              <p className="text-xs mt-0.5">{paymentError}</p>
            </div>
          </div>
        )}

        {/* Resumo do Pedido Top Banner */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-md">
                Pedido #{order.id.slice(0, 8)}
              </span>
              <h1 className="text-xl font-extrabold text-gray-900 mt-1.5">
                {event?.title || 'Evento'}
              </h1>
              {event?.start_date && (
                <p className="text-xs text-gray-600 mt-0.5">
                  {formatShortDate(event.start_date)} • {event.location_name}
                </p>
              )}
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs text-gray-600 block">Total a pagar</span>
              <span className="text-2xl font-extrabold text-blue-600">
                {formatCurrency(order.total_amount)}
              </span>
            </div>
          </div>

          {/* Stepper Navegação */}
          <div className="flex items-center justify-center gap-4 pt-5">
            <button
              onClick={() => setStep('attendees')}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition ${
                step === 'attendees'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <User className="w-4 h-4" />
              <span>1. Titulares dos Ingressos</span>
            </button>

            <div className="w-6 h-[2px] bg-gray-200" />

            <button
              onClick={() => {
                if (validateAttendees()) {
                  setStep('pix');
                }
              }}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition ${
                step === 'pix'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>2. Pagamento Pix</span>
            </button>
          </div>
        </div>

        {/* ETAPA 1: Formulário de Participantes */}
        {step === 'attendees' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-gray-900">
                  Dados dos Titulares dos Ingressos
                </h2>
              </div>
              <p className="text-xs text-gray-500 mb-6">
                Informe o nome, CPF e e-mail de cada participante. Esses dados estarão vinculados ao QR Code individual para validação na portaria.
              </p>

              <div className="space-y-6">
                {orderItems.map((item) => {
                  return Array.from({ length: item.quantity }).map((_, index) => {
                    const key = `${item.batch_id}_${index}`;
                    const attendee = attendeesMap[key] || { name: '', cpf: '', email: '' };

                    return (
                      <div
                        key={key}
                        className="p-5 rounded-xl border border-gray-200 bg-gray-50/70 space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                              {index + 1}
                            </span>
                            <span className="text-sm font-bold text-gray-800">
                              {item.batch?.name || 'Ingresso'}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-blue-600">
                            {formatCurrency(item.unit_price)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                              Nome Completo *
                            </label>
                            <input
                              type="text"
                              required
                              value={attendee.name}
                              onChange={(e) => handleAttendeeChange(key, 'name', e.target.value)}
                              placeholder="Nome do titular"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                              CPF *
                            </label>
                            <input
                              type="text"
                              required
                              maxLength={14}
                              value={attendee.cpf}
                              onChange={(e) => handleAttendeeChange(key, 'cpf', e.target.value)}
                              placeholder="000.000.000-00"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                              E-mail *
                            </label>
                            <input
                              type="email"
                              required
                              value={attendee.email}
                              onChange={(e) => handleAttendeeChange(key, 'email', e.target.value)}
                              placeholder="email@participante.com"
                              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  });
                })}
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => {
                    if (validateAttendees()) {
                      setStep('pix');
                    }
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2"
                >
                  <span>Continuar para Pagamento Pix</span>
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2: Pagamento Pix */}
        {step === 'pix' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
              <div className="text-center max-w-md mx-auto mb-8">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-200">
                  <Zap className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-extrabold text-gray-900">
                  Pague com Pix
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Abra o aplicativo do seu banco, escolha <strong>Pagar com Pix</strong> e aponte a câmera para o QR Code ou copie o código abaixo.
                </p>
              </div>

              {/* QR Code Central */}
              <div className="flex flex-col items-center justify-center mb-8">
                <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-gray-300 shadow-md">
                  <QRCodeSVG
                    value={pixCopyPasteCode}
                    size={220}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 mt-3 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Aguardando identificação do pagamento...</span>
                </div>
              </div>

              {/* Código Pix Copia e Cola */}
              <div className="max-w-lg mx-auto space-y-2 mb-8">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider text-center">
                  Código Pix Copia e Cola
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={pixCopyPasteCode}
                    className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono text-gray-600 truncate focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 flex-shrink-0"
                  >
                    {copiedPix ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar Código</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Ambiente de Teste / Dev - Simulação de Confirmação */}
              <div className="mt-8 pt-6 border-t border-gray-200 bg-amber-50/60 -mx-6 -mb-6 p-6 rounded-b-2xl border-dashed border-amber-200">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      <span>Simulador de Webhook Pix (Ambiente Dev)</span>
                    </div>
                    <p className="text-xs text-amber-700 max-w-md">
                      Dispara a RPC <code>confirm_order_payment</code> emitindo os ingressos com HMAC-SHA256 e atualiza o pedido para <code>paid</code> em tempo real.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={simulatingPayment}
                    onClick={handleSimulatePayment}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {simulatingPayment ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Confirmando...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>⚡ Simular Confirmação de Pagamento</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
