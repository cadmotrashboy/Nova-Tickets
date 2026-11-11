import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { 
  Ticket as TicketIcon, 
  Calendar, 
  MapPin, 
  User, 
  QrCode, 
  Printer, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Download, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Ticket, Event, TicketBatch } from '../types/database';
import { useAuth } from '../context/AuthContext';
import { formatFullDate, maskCPF } from '../utils/formatters';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { AuthModal } from '../components/AuthModal';

interface EnrichedTicket extends Ticket {
  events?: Event;
  ticket_batches?: TicketBatch;
}

export const MyTicketsPage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [tickets, setTickets] = useState<EnrichedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [selectedTicketForModal, setSelectedTicketForModal] = useState<EnrichedTicket | null>(null);

  const showPaymentSuccessAlert = Boolean(location.state?.paymentSuccess);

  useEffect(() => {
    if (user) {
      loadTickets();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadTickets = async () => {
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Fallback tickets locais de teste
        const localTickets = localStorage.getItem(`tickets_user_${user?.id}`);
        if (localTickets) {
          const parsed = JSON.parse(localTickets);
          setTickets(
            parsed.map((t: any) => ({
              ...t,
              events: t.event,
              ticket_batches: t.batch,
            }))
          );
        } else {
          setTickets([]);
        }
        setLoading(false);
        return;
      }

      // Consulta oficial no Supabase: tickets do usuário através das orders ou tickets emitidos
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          events (*),
          ticket_batches (*)
        `)
        .eq('status', 'valid')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Erro ao buscar ingressos no Supabase:', error);
        // Fallback local se houver
        const localTickets = localStorage.getItem(`tickets_user_${user?.id}`);
        if (localTickets) {
          setTickets(JSON.parse(localTickets));
        } else {
          setTickets([]);
        }
      } else if (data) {
        setTickets(data as unknown as EnrichedTicket[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Banner de Pagamento Confirmado */}
        {showPaymentSuccessAlert && (
          <div className="mb-8 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-4 shadow-sm animate-fade-in">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-950">
                Pagamento confirmado com sucesso!
              </h3>
              <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                Seus ingressos foram emitidos com hash de segurança criptográfico. Apresente o QR Code na entrada do evento.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Meus Ingressos
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              Visualize, salve ou apresente seus ingressos válidos para entrada nos eventos.
            </p>
          </div>

          {tickets.length > 0 && (
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Printer className="w-4 h-4 text-gray-500" />
              <span>Imprimir Ingressos</span>
            </button>
          )}
        </div>

        {/* Verificação se o usuário está logado */}
        {!user ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md mx-auto shadow-sm">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Conecte-se para ver seus ingressos</h3>
            <p className="text-xs text-gray-500 mb-6">
              Você precisa entrar com a sua conta para acessar os ingressos adquiridos.
            </p>
            <button
              onClick={() => setIsAuthOpen(true)}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-md"
            >
              Entrar na Conta
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
            <p className="text-sm font-semibold">Carregando seus ingressos...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center max-w-lg mx-auto shadow-sm">
            <div className="w-16 h-16 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TicketIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Nenhum ingresso encontrado</h3>
            <p className="text-xs text-gray-500 mb-6">
              Você ainda não possui ingressos comprados ou válidos em sua conta.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow"
            >
              <span>Explorar Eventos Disponíveis</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          /* Grid de Ticket Stubs (Cards estilo bilhete clássico) */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tickets.map((ticket) => {
              const eventTitle = ticket.events?.title || 'Evento Nova Tickets';
              const eventDate = ticket.events?.start_date;
              const locationName = ticket.events?.location_name || ticket.events?.address || 'Local a confirmar';
              const batchName = ticket.ticket_batches?.name || 'Ingresso Geral';

              return (
                <div
                  key={ticket.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col justify-between relative group"
                >
                  {/* Recortes visuais de ticket stub */}
                  <div className="ticket-notch-left hidden sm:block border-r border-gray-200 shadow-inner" />
                  <div className="ticket-notch-right hidden sm:block border-l border-gray-200 shadow-inner" />

                  {/* Header do Bilhete com faixa colorida */}
                  <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-5 text-white flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200 block">
                        Ingresso Oficial
                      </span>
                      <h3 className="text-base font-extrabold leading-snug line-clamp-1 mt-0.5">
                        {eventTitle}
                      </h3>
                    </div>

                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Válido
                    </span>
                  </div>

                  {/* Corpo do Bilhete */}
                  <div className="p-6 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                    {/* Detalhes do Participante & Evento (7 colunas) */}
                    <div className="sm:col-span-7 space-y-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-gray-600 block tracking-wider">
                          Titular do Ingresso
                        </span>
                        <span className="text-sm font-extrabold text-gray-900 block truncate">
                          {ticket.owner_name}
                        </span>
                        <span className="text-xs text-gray-600 font-mono">
                          CPF: {maskCPF(ticket.owner_cpf)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-gray-100">
                        <span className="text-[10px] uppercase font-bold text-gray-600 block tracking-wider">
                          Lote / Categoria
                        </span>
                        <span className="text-xs font-bold text-blue-600 block">
                          {batchName}
                        </span>
                      </div>

                      {eventDate && (
                        <div className="pt-2 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="capitalize">{formatFullDate(eventDate)}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs text-gray-600 truncate">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{locationName}</span>
                      </div>
                    </div>

                    {/* QR Code de Validação (5 colunas) */}
                    <div className="sm:col-span-5 flex flex-col items-center justify-center p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300 text-center">
                      <QRCodeSVG
                        value={ticket.qr_code_hash}
                        size={110}
                        level="M"
                        includeMargin={false}
                      />
                      <span className="text-[9px] font-mono text-gray-600 mt-2 block tracking-tighter truncate max-w-[130px]">
                        {ticket.qr_code_hash.slice(0, 16)}...
                      </span>
                      <span className="text-[9px] font-semibold text-blue-600 uppercase tracking-wider mt-0.5">
                        Apresente na entrada
                      </span>
                    </div>
                  </div>

                  {/* Rodapé do Bilhete */}
                  <div className="bg-gray-50/80 px-6 py-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600 font-medium">
                    <span>ID: {ticket.id.slice(0, 8)}</span>
                    <button
                      onClick={() => setSelectedTicketForModal(ticket)}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      Ampliar QR Code
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Footer />

      {/* Modal de Exibição Ampliada do QR Code para Portaria */}
      {selectedTicketForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl space-y-4">
            <h3 className="text-lg font-extrabold text-gray-900">
              {selectedTicketForModal.events?.title || 'Ingresso'}
            </h3>
            <p className="text-xs text-gray-500">
              Titular: <strong>{selectedTicketForModal.owner_name}</strong>
            </p>

            <div className="p-4 bg-white rounded-2xl border-2 border-dashed border-blue-200 inline-block shadow-inner">
              <QRCodeSVG
                value={selectedTicketForModal.qr_code_hash}
                size={220}
                level="H"
                includeMargin={true}
              />
            </div>

            <p className="text-xs font-mono text-gray-400 break-all">
              {selectedTicketForModal.qr_code_hash}
            </p>

            <button
              onClick={() => setSelectedTicketForModal(null)}
              className="w-full py-3 bg-gray-900 text-white rounded-xl text-xs font-bold hover:bg-black transition"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={loadTickets} />
    </div>
  );
};
