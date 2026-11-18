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
  CreditCard, 
  ShieldCheck, 
  ArrowLeft, 
  Loader2, 
  Sparkles,
  Zap,
  Lock,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Order, OrderItem, Event, TicketBatch, AttendeePayload, PaymentMethod } from '../types/database';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatCPF, formatShortDate } from '../utils/formatters';
import { processCardPayment, processPixPayment } from '../services/paymentService';
import { InteractiveCardPreview } from '../components/checkout/InteractiveCardPreview';
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
  
  // Controle de etapas: 'attendees' (Participantes) | 'payment' (Pagamento)
  const [step, setStep] = useState<'attendees' | 'payment'>('attendees');

  // Método de pagamento selecionado na Etapa 2
  const [paymentTab, setPaymentTab] = useState<PaymentMethod>('pix');

  // Participantes por ingresso: indexado por `${item.batch_id}_${attendeeIndex}`
  const [attendeesMap, setAttendeesMap] = useState<Record<string, FormAttendee>>({});
  
  // Dados do Cartão
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState(''); // MM/AA
  const [cardCvv, setCardCvv] = useState('');
  const [cardCpf, setCardCpf] = useState('');
  const [installments, setInstallments] = useState<number>(1);

  // Estados de feedback
  const [copiedPix, setCopiedPix] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
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
          initial[key] = {
            name: profile?.full_name || '',
            cpf: profile?.cpf || '',
            email: user.email || '',
          };
          // Preenche também o CPF do cartão como conveniência
          if (profile?.cpf) setCardCpf(formatCPF(profile.cpf));
          if (profile?.full_name) setCardHolder(profile.full_name);
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

  // 4. Processamento de Pagamento com Cartão (Crédito ou Débito)
  const handleProcessCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (!validateAttendees()) return;

    setPaymentError(null);
    setIsProcessingPayment(true);

    const [month, year] = cardExpiry.split('/');
    const attendeesPayload = buildAttendeesPayload();

    try {
      const result = await processCardPayment({
        orderId: order.id,
        paymentMethod: paymentTab === 'debit_card' ? 'debit_card' : 'credit_card',
        card: {
          holderName: cardHolder,
          number: cardNumber,
          expiryMonth: month || '',
          expiryYear: year || '',
          ccv: cardCvv,
          holderCpf: cardCpf,
        },
        installments: paymentTab === 'debit_card' ? 1 : installments,
        attendees: attendeesPayload,
        totalAmount: order.total_amount,
      });

      if (!result.success) {
        setPaymentError(
          result.message || 'Cartão recusado pela operadora. Verifique os dados ou tente via Pix.'
        );
        return;
      }

      // Sucesso na transação com cartão
      navigate('/meus-ingressos', { state: { paymentSuccess: true } });
    } catch (err: any) {
      console.error('Falha no pagamento com cartão:', err);
      setPaymentError(err.message || 'Erro inesperado na operadora. Tente novamente ou pague via Pix.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // 5. Simulação de Confirmação do Pix (Dev / Teste Rápido)
  const handleSimulatePixPayment = async () => {
    if (!order) return;
    if (!validateAttendees()) return;

    setIsProcessingPayment(true);
    setPaymentError(null);

    const attendeesPayload = buildAttendeesPayload();

    try {
      const result = await processPixPayment(order.id, attendeesPayload);
      if (!result.success) {
        setPaymentError(result.message || 'Erro ao confirmar Pix.');
        return;
      }
      navigate('/meus-ingressos', { state: { paymentSuccess: true } });
    } catch (err: any) {
      setPaymentError(err.message || 'Erro ao processar Pix.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Máscaras de entrada para o cartão
  const handleCardNumberChange = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 16);
    const parts = clean.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(' ') : clean);
  };

  const handleExpiryChange = (val: string) => {
    let clean = val.replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 3) {
      clean = `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
    }
    setCardExpiry(clean);
  };

  // Cálculo das opções de parcelamento
  const installmentOptions = useMemo(() => {
    if (!order) return [];
    const total = order.total_amount;
    const options = [];

    for (let i = 1; i <= 12; i++) {
      if (i === 1) {
        options.push({
          count: 1,
          label: `1x de ${formatCurrency(total)} (à vista sem juros)`,
          installmentAmount: total,
        });
      } else if (i <= 6) {
        const part = total / i;
        options.push({
          count: i,
          label: `${i}x de ${formatCurrency(part)} sem juros`,
          installmentAmount: part,
        });
      } else {
        // Simulação com pequena taxa de parcelamento
        const totalWithInterest = total * (1 + (i * 0.012));
        const part = totalWithInterest / i;
        options.push({
          count: i,
          label: `${i}x de ${formatCurrency(part)} (total ${formatCurrency(totalWithInterest)})`,
          installmentAmount: part,
        });
      }
    }
    return options;
  }, [order?.total_amount]);

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

  const [monthPart, yearPart] = cardExpiry.split('/');

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
        
        {/* Alerta de Erro no Pagamento (visível sem resetar dados dos participantes) */}
        {paymentError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm shadow-sm animate-fade-in">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Aviso no Pagamento</p>
              <p className="text-xs mt-0.5 text-red-600">{paymentError}</p>
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
                  setStep('payment');
                }
              }}
              className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-xl transition ${
                step === 'payment'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>2. Escolher Pagamento</span>
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
                      setStep('payment');
                    }
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md transition flex items-center gap-2"
                >
                  <span>Avançar para Pagamento</span>
                  <CreditCard className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2: Escolha de Método de Pagamento com Abas */}
        {step === 'payment' && (
          <div className="space-y-6">
            
            {/* Seletor de Abas de Pagamento */}
            <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-sm grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentTab('pix');
                  setPaymentError(null);
                }}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  paymentTab === 'pix'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Pix (Imediato)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentTab('credit_card');
                  setPaymentError(null);
                }}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  paymentTab === 'credit_card'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Cartão de Crédito</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentTab('debit_card');
                  setPaymentError(null);
                }}
                className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  paymentTab === 'debit_card'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Cartão de Débito</span>
              </button>
            </div>

            {/* CONTEÚDO DA ABA 1: PIX */}
            {paymentTab === 'pix' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
                <div className="text-center max-w-md mx-auto mb-8">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-200">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-gray-900">
                    Pague com Pix
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Abra o app do seu banco, escolha <strong>Pagar com Pix</strong> e aponte a câmera para o QR Code ou copie o código abaixo.
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
                    <span>Aguardando identificação do pagamento em tempo real...</span>
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

                {/* Simulação Dev */}
                <div className="pt-6 border-t border-gray-100 flex items-center justify-between flex-wrap gap-4 bg-emerald-50/50 -mx-6 -mb-6 p-6 rounded-b-2xl">
                  <div>
                    <span className="text-xs font-bold text-emerald-900 block">
                      Ambiente de Testes / Sandbox
                    </span>
                    <span className="text-xs text-emerald-700">
                      Simule a notificação de confirmação do Pix para emitir os ingressos.
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isProcessingPayment}
                    onClick={handleSimulatePixPayment}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-2"
                  >
                    {isProcessingPayment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Simular Confirmação Pix</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* CONTEÚDO DA ABA 2 e 3: CARTÃO DE CRÉDITO OU DÉBITO */}
            {(paymentTab === 'credit_card' || paymentTab === 'debit_card') && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
                
                {/* Visual Interativo do Cartão com Atualização em Tempo Real */}
                <InteractiveCardPreview
                  number={cardNumber}
                  holderName={cardHolder}
                  expiryMonth={monthPart || ''}
                  expiryYear={yearPart || ''}
                  isDebit={paymentTab === 'debit_card'}
                />

                <form onSubmit={handleProcessCard} className="max-w-xl mx-auto space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Número do Cartão *
                    </label>
                    <div className="relative">
                      <CreditCard className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        maxLength={19}
                        value={cardNumber}
                        onChange={(e) => handleCardNumberChange(e.target.value)}
                        placeholder="0000 0000 0000 0000"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Nome Impresso no Cartão *
                    </label>
                    <input
                      type="text"
                      required
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="COMO CONSTA NO CARTÃO"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        Validade (MM/AA) *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => handleExpiryChange(e.target.value)}
                        placeholder="12/28"
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        CVV / Código de Segurança *
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          required
                          maxLength={4}
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                          placeholder="123"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      CPF do Titular do Cartão *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={14}
                      value={cardCpf}
                      onChange={(e) => setCardCpf(formatCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                    />
                  </div>

                  {/* Seletor de Parcelamento (Apenas Crédito) */}
                  {paymentTab === 'credit_card' ? (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        Opções de Parcelamento *
                      </label>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(parseInt(e.target.value, 10))}
                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                      >
                        {installmentOptions.map((opt) => (
                          <option key={opt.count} value={opt.count}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-700 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <span>
                        Débito à vista: O valor de <strong>{formatCurrency(order.total_amount)}</strong> será debitado diretamente de sua conta bancária.
                      </span>
                    </div>
                  )}

                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    <button
                      type="submit"
                      disabled={isProcessingPayment}
                      className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isProcessingPayment ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Processando pagamento com a operadora...</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>
                            {paymentTab === 'credit_card'
                              ? `Pagar ${formatCurrency(order.total_amount)} em ${installments}x`
                              : `Pagar ${formatCurrency(order.total_amount)} no Débito`}
                          </span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Transação criptografada com certificado SSL e autenticação 3DS</span>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
