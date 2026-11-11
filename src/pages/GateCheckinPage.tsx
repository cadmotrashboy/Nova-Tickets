import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Camera, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowLeft, 
  Search, 
  Users, 
  Clock, 
  Sparkles,
  Ticket,
  ChevronRight,
  ShieldCheck,
  Zap,
  Volume2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Event, Ticket as TicketType } from '../types/database';
import { 
  saveTicketsLocal, 
  findTicketLocal, 
  markTicketAsUsedLocal, 
  getEventStatsLocal, 
  addToSyncQueue, 
  getSyncQueue, 
  removeFromSyncQueue,
  updateTicketLocal,
  LocalTicket
} from '../services/portariaDb';
import { portariaAudio } from '../services/portariaAudio';
import { formatShortDate, maskCPF } from '../utils/formatters';

interface ValidationOverlayState {
  type: 'success' | 'already_used' | 'invalid';
  ticket?: LocalTicket;
  rawInput?: string;
}

export const GateCheckinPage: React.FC = () => {
  const { event_id: eventId } = useParams<{ event_id: string }>();
  const { user } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncPendingCount, setSyncPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, valid: 0 });

  // Histórico local dos últimos check-ins da sessão atual
  const [recentCheckins, setRecentCheckins] = useState<LocalTicket[]>([]);

  // Estado do leitor da câmera
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningBlockedRef = useRef<boolean>(false);

  // Campo de entrada manual
  const [manualCode, setManualCode] = useState<string>('');

  // Overlay de validação em tela cheia
  const [overlay, setOverlay] = useState<ValidationOverlayState | null>(null);

  // 1. Atualização e monitoramento da conexão de rede
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncQueueWithSupabase();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [eventId]);

  // 2. Carregamento inicial do evento e sincronização de ingressos no IndexedDB
  useEffect(() => {
    if (eventId) {
      loadEventAndSyncTickets(eventId);
    }
  }, [eventId]);

  // Recarrega estatísticas locais do IndexedDB
  const refreshStats = useCallback(async () => {
    if (!eventId) return;
    const currentStats = await getEventStatsLocal(eventId);
    setStats(currentStats);

    const pending = await getSyncQueue();
    setSyncPendingCount(pending.length);
  }, [eventId]);

  const loadEventAndSyncTickets = async (id: string) => {
    try {
      if (isSupabaseConfigured) {
        // Busca evento
        const { data: eventData } = await supabase
          .from('events')
          .select('*')
          .eq('id', id)
          .single();

        if (eventData) {
          setEvent(eventData as Event);
        }

        // Baixa todos os ingressos deste evento para o cache local
        const { data: ticketsData, error: ticketsError } = await supabase
          .from('tickets')
          .select('*, ticket_batches(*)')
          .eq('event_id', id);

        if (!ticketsError && ticketsData) {
          const localFormatted: LocalTicket[] = ticketsData.map((t: any) => ({
            ...t,
            batch_name: t.ticket_batches?.name || 'Ingresso Geral',
            batch_price: t.ticket_batches?.price || 0,
          }));

          await saveTicketsLocal(localFormatted);
        }
      }

      await refreshStats();
      await syncQueueWithSupabase();
    } catch (err) {
      console.error('Erro ao sincronizar portaria:', err);
    }
  };

  // 3. Sincronização da fila offline com o Supabase
  const syncQueueWithSupabase = async () => {
    if (!navigator.onLine || !isSupabaseConfigured) return;

    setIsSyncing(true);
    try {
      const queue = await getSyncQueue();
      for (const item of queue) {
        if (!item.id) continue;

        const { error } = await supabase
          .from('tickets')
          .update({
            status: 'used',
            checked_in_at: item.checkedInAt,
            checked_in_by: item.checkedInBy || null,
          })
          .eq('id', item.ticketId);

        if (!error) {
          await removeFromSyncQueue(item.id);
        }
      }

      await refreshStats();
    } catch (err) {
      console.warn('Erro ao processar fila offline:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // 4. Supabase Realtime para sincronizar múltiplos celulares de porteiros
  useEffect(() => {
    if (!eventId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`portaria-tickets-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `event_id=eq.${eventId}`,
        },
        async (payload) => {
          const updated = payload.new as TicketType;
          await updateTicketLocal(updated as LocalTicket);
          await refreshStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, refreshStats]);

  // 5. Inicia e controla a câmera traseira para leitura contínua de QR Code
  useEffect(() => {
    let isMounted = true;
    const scannerId = 'qr-reader-viewport';

    const startCamera = async () => {
      try {
        setCameraError(null);
        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!isScanningBlockedRef.current) {
              handleValidateCode(decodedText);
            }
          },
          () => {
            // Leitura contínua sem QR code no frame - ignora
          }
        );

        if (isMounted) {
          setCameraActive(true);
        }
      } catch (err: any) {
        console.warn('Câmera não iniciada:', err);
        if (isMounted) {
          setCameraError(
            'Não foi possível acessar a câmera traseira. Verifique as permissões de vídeo do navegador ou utilize a validação manual abaixo.'
          );
          setCameraActive(false);
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear();
          });
      }
    };
  }, [eventId]);

  // 6. Lógica Principal de Validação de Ingresso (< 100ms no cache local)
  const handleValidateCode = async (rawCode: string) => {
    if (!eventId || !rawCode.trim()) return;

    // Bloqueia leituras repetidas enquanto processa e exibe o overlay
    isScanningBlockedRef.current = true;

    try {
      // 1. Busca primeiro no IndexedDB local (< 10ms)
      let ticket = await findTicketLocal(eventId, rawCode.trim());

      // Se não encontrou no cache local e estamos online, tenta uma última consulta no Supabase
      if (!ticket && isOnline && isSupabaseConfigured) {
        const { data: dbTicket } = await supabase
          .from('tickets')
          .select('*, ticket_batches(*)')
          .eq('event_id', eventId)
          .or(`qr_code_hash.eq.${rawCode.trim()},id.eq.${rawCode.trim()}`)
          .maybeSingle();

        if (dbTicket) {
          ticket = {
            ...(dbTicket as any),
            batch_name: (dbTicket as any).ticket_batches?.name || 'Ingresso',
          };
          if (ticket) {
            await saveTicketsLocal([ticket]);
          }
        }
      }

      // CASO A: Ingresso Não Encontrado
      if (!ticket) {
        portariaAudio.playInvalid();
        setOverlay({ type: 'invalid', rawInput: rawCode });
        closeOverlayAfterDelay(2200);
        return;
      }

      // CASO B: Ingresso Já Utilizado
      if (ticket.status === 'used') {
        portariaAudio.playAlreadyUsed();
        setOverlay({ type: 'already_used', ticket });
        closeOverlayAfterDelay(3000);
        return;
      }

      // CASO C: Ingresso Válido! Libera entrada imediata
      const nowIso = new Date().toISOString();
      const operatorId = user?.id || 'portaria-local';

      // Atualiza localmente no IndexedDB
      const updatedLocal = await markTicketAsUsedLocal(ticket.id, nowIso, operatorId);

      // Feedback de áudio e visual de sucesso instantâneo
      portariaAudio.playSuccess();
      setOverlay({ type: 'success', ticket: updatedLocal || ticket });

      // Adiciona aos check-ins recentes da sessão
      setRecentCheckins((prev) => [updatedLocal || ticket, ...prev.slice(0, 4)]);
      await refreshStats();

      // Envia para o Supabase ou enfileira se estiver sem internet
      if (isOnline && isSupabaseConfigured) {
        supabase
          .from('tickets')
          .update({
            status: 'used',
            checked_in_at: nowIso,
            checked_in_by: operatorId,
          })
          .eq('id', ticket.id)
          .then(({ error }) => {
            if (error) {
              console.warn('Erro ao atualizar Supabase online, salvando na fila:', error);
              addToSyncQueue(ticket.id, nowIso, operatorId).then(refreshStats);
            }
          });
      } else {
        // Modo offline: guarda na fila local
        await addToSyncQueue(ticket.id, nowIso, operatorId);
        await refreshStats();
      }

      closeOverlayAfterDelay(2000);
    } catch (err) {
      console.error('Erro na validação do ingresso:', err);
      portariaAudio.playInvalid();
      setOverlay({ type: 'invalid', rawInput: rawCode });
      closeOverlayAfterDelay(2200);
    }
  };

  const closeOverlayAfterDelay = (ms: number) => {
    setTimeout(() => {
      setOverlay(null);
      isScanningBlockedRef.current = false;
    }, ms);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleValidateCode(manualCode);
      setManualCode('');
    }
  };

  // Cálculo da porcentagem de público presente
  const attendanceRate = stats.total > 0
    ? Math.round((stats.checkedIn / stats.total) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-x-hidden">
      
      {/* 1. TOPO: Nome do Evento, Indicador de Rede e Progresso */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-4 sticky top-0 z-30">
        <div className="max-w-md mx-auto space-y-3">
          
          <div className="flex items-center justify-between">
            <Link
              to="/dashboard"
              className="p-2 -ml-2 text-slate-400 hover:text-white rounded-xl transition flex items-center gap-1 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Painel</span>
            </Link>

            {/* Badge de Conexão com indicador de pendência offline */}
            <div className="flex items-center gap-2">
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <Wifi className="w-3 h-3" />
                  <span>Online</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <WifiOff className="w-3 h-3" />
                  <span>Modo Offline</span>
                </span>
              )}

              {syncPendingCount > 0 && (
                <button
                  onClick={syncQueueWithSupabase}
                  disabled={isSyncing || !isOnline}
                  className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{syncPendingCount} pendente{syncPendingCount > 1 ? 's' : ''}</span>
                </button>
              )}
            </div>
          </div>

          <div>
            <h1 className="text-base font-extrabold text-white truncate leading-tight">
              {event?.title || 'Controle de Portaria'}
            </h1>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Validador Oficial de Ingressos HMAC-SHA256</span>
            </p>
          </div>

          {/* Barra de Progresso de Entrada */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300">
                Entraram <strong>{stats.checkedIn}</strong> de {stats.total}
              </span>
              <span className="text-blue-400 font-bold">{attendanceRate}% presentes</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, attendanceRate)}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* 2. ÁREA CENTRAL: Visor da Câmera e Scanner QR Code */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-4 flex flex-col justify-between space-y-4">
        
        <div className="space-y-4">
          
          {/* Viewport do Scanner de QR Code */}
          <div className="relative rounded-3xl overflow-hidden bg-slate-900 border-2 border-slate-800 shadow-2xl aspect-square flex items-center justify-center">
            
            {/* Elemento onde a biblioteca html5-qrcode injeta o feed de vídeo */}
            <div id="qr-reader-viewport" className="w-full h-full object-cover" />

            {/* Mira de mira visual no centro do visor */}
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-56 border-2 border-blue-500/70 rounded-3xl relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-400 rounded-br-xl" />
                  {/* Linha de varredura animada */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse absolute top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {/* Mensagem caso a câmera não esteja disponível */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center text-slate-300 space-y-3">
                <Camera className="w-10 h-10 text-slate-500" />
                <p className="text-xs leading-relaxed text-slate-400">{cameraError}</p>
                <p className="text-[11px] text-blue-400 font-semibold">
                  Utilize a digitação manual abaixo para validar.
                </p>
              </div>
            )}
          </div>

          {/* Campo de Digitação Manual com botão rápido */}
          <form onSubmit={handleManualSubmit} className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Digitação Manual do Código / Hash
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Cole ou digite o hash do QR Code..."
                  className="w-full pl-10 pr-3 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition shadow-inner"
                />
              </div>
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold transition shadow-md disabled:opacity-40"
              >
                Validar
              </button>
            </div>
          </form>
        </div>

        {/* 3. RODAPÉ: Histórico dos Últimos 5 Check-ins */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>Últimas Entradas Confirmadas</span>
            </span>
            <span className="text-[10px] text-slate-500">Nesta sessão</span>
          </div>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {recentCheckins.length === 0 ? (
              <div className="text-center py-6 text-slate-600 text-xs border border-dashed border-slate-800 rounded-2xl">
                Nenhum check-in realizado nesta sessão ainda.
              </div>
            ) : (
              recentCheckins.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className="p-3 bg-slate-900 border border-slate-800/80 rounded-2xl flex items-center justify-between text-xs animate-fade-in"
                >
                  <div className="min-w-0 pr-2">
                    <span className="font-bold text-white block truncate">
                      {item.owner_name}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {item.batch_name || 'Ingresso'} • CPF: {maskCPF(item.owner_cpf)}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                      <CheckCircle2 className="w-3 h-3" /> OK
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {item.checked_in_at ? formatShortDate(item.checked_in_at).split('•')[1] : 'Agora'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* 4. OVERLAYS DE VALIDAÇÃO INSTANTÂNEA EM TELA CHEIA */}
      {overlay && (
        <div
          onClick={() => {
            setOverlay(null);
            isScanningBlockedRef.current = false;
          }}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none transition-all duration-300 ${
            overlay.type === 'success'
              ? 'bg-emerald-600 text-white animate-fade-in'
              : overlay.type === 'already_used'
              ? 'bg-rose-700 text-white animate-pulse'
              : 'bg-amber-600 text-white animate-fade-in'
          }`}
        >
          {/* ÍCONE GIGANTE CENTRAL */}
          <div className="w-28 h-28 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-6 shadow-2xl">
            {overlay.type === 'success' && <CheckCircle2 className="w-16 h-16 text-white" />}
            {overlay.type === 'already_used' && <XCircle className="w-16 h-16 text-white" />}
            {overlay.type === 'invalid' && <AlertTriangle className="w-16 h-16 text-white" />}
          </div>

          {/* MENSAGEM PRINCIPAL */}
          <div className="space-y-2 max-w-sm">
            <h2 className="text-3xl font-black uppercase tracking-tight">
              {overlay.type === 'success' && 'ENTRADA LIBERADA!'}
              {overlay.type === 'already_used' && 'INGRESSO JÁ UTILIZADO!'}
              {overlay.type === 'invalid' && 'INGRESSO INVÁLIDO!'}
            </h2>

            {/* DETALHES DO TITULAR SE DISPONÍVEL */}
            {overlay.ticket && (
              <div className="bg-black/20 backdrop-blur-sm rounded-2xl p-4 mt-4 text-left border border-white/20 space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-white/70 block tracking-wider">
                    Titular do Ingresso
                  </span>
                  <span className="text-xl font-extrabold text-white block leading-tight">
                    {overlay.ticket.owner_name}
                  </span>
                  <span className="text-xs font-mono text-white/80">
                    CPF: {maskCPF(overlay.ticket.owner_cpf)}
                  </span>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-white/90">
                    {overlay.ticket.batch_name || 'Lote Padrão'}
                  </span>
                  <span className="text-[11px] font-mono text-white/70">
                    ID: {overlay.ticket.id.slice(0, 8)}
                  </span>
                </div>

                {overlay.type === 'already_used' && overlay.ticket.checked_in_at && (
                  <div className="pt-2 border-t border-white/10 text-xs font-bold text-yellow-200">
                    Entrada registrada anteriormente às{' '}
                    {formatShortDate(overlay.ticket.checked_in_at)}
                  </div>
                )}
              </div>
            )}

            {overlay.type === 'invalid' && (
              <p className="text-sm text-white/90 mt-2">
                Este código não corresponde a nenhum ingresso válido deste evento.
              </p>
            )}
          </div>

          <span className="mt-8 text-xs uppercase tracking-widest text-white/70 font-semibold">
            Toque na tela para fechar
          </span>
        </div>
      )}
    </div>
  );
};
