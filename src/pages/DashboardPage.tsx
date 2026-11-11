import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Calendar, 
  PlusCircle, 
  Users, 
  DollarSign, 
  ArrowLeft, 
  Loader2, 
  AlertCircle,
  Menu,
  X,
  Ticket,
  Building2,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Organizer } from '../types/database';
import { ProducerOnboarding } from '../components/producer/ProducerOnboarding';
import { DashboardOverview } from '../components/producer/DashboardOverview';
import { EventManager } from '../components/producer/EventManager';
import { AttendeesAndCheckin } from '../components/producer/AttendeesAndCheckin';
import { FinancialSettings } from '../components/producer/FinancialSettings';
import { AuthModal } from '../components/AuthModal';

export const DashboardPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Aba ativa: overview | events | events_new | attendees | settings | event_{id}
  const activeTab = searchParams.get('tab') || 'overview';

  const setTab = (tabName: string) => {
    setSearchParams({ tab: tabName });
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        setLoadingOrg(false);
        setIsAuthModalOpen(true);
      } else {
        loadOrganizerProfile(user.id);
      }
    }
  }, [user, authLoading]);

  const loadOrganizerProfile = async (userId: string) => {
    setLoadingOrg(true);
    try {
      if (!isSupabaseConfigured) {
        // Fallback local se não configurado
        const saved = localStorage.getItem(`producer_org_${userId}`);
        if (saved) {
          setOrganizer(JSON.parse(saved));
        } else {
          setOrganizer(null);
        }
        setLoadingOrg(false);
        return;
      }

      // Consulta no Supabase se o usuário logado possui registro na tabela organizers
      const { data, error } = await supabase
        .from('organizers')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Erro ao consultar organizers:', error);
      }

      if (data) {
        setOrganizer(data as Organizer);
      } else {
        setOrganizer(null);
      }
    } catch (err) {
      console.error('Erro ao verificar produtor:', err);
    } finally {
      setLoadingOrg(false);
    }
  };

  // Se o carregamento de autenticação ou de produtor estiver em andamento
  if (authLoading || loadingOrg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-semibold">Carregando painel do produtor...</p>
      </div>
    );
  }

  // Se o usuário não estiver logado
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-100 py-4 px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Ticket className="w-4 h-4 -rotate-12" />
            </div>
            <span className="font-extrabold text-gray-900 tracking-tight">NovaTickets</span>
          </Link>
          <Link to="/" className="text-xs font-bold text-gray-600 hover:text-blue-600">
            Voltar para Vitrine Pública
          </Link>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-4 shadow-inner">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2">
            Painel do Produtor de Eventos
          </h2>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            Faça login ou crie sua conta para publicar eventos, acompanhar vendas e gerenciar check-ins.
          </p>
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition"
          >
            Acessar Conta de Produtor
          </button>
        </div>

        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={async () => {
            const { data } = await supabase.auth.getUser();
            if (data?.user) {
              loadOrganizerProfile(data.user.id);
            }
          }}
          title="Acesse sua Conta de Produtor"
          subtitle="Entre para gerenciar seus eventos e ingressos na Nova Tickets."
        />
      </div>
    );
  }

  // Se o usuário não tiver registro na tabela organizers -> Onboarding
  if (!organizer) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50">
        <header className="bg-white border-b border-gray-100 py-4 px-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Ticket className="w-4 h-4 -rotate-12" />
            </div>
            <span className="font-extrabold text-gray-900 tracking-tight">NovaTickets</span>
          </Link>
          <Link to="/" className="text-xs font-bold text-gray-600 hover:text-blue-600">
            Voltar para Vitrine
          </Link>
        </header>

        <div className="flex-1 py-8">
          <ProducerOnboarding
            onSuccess={(newOrg) => {
              setOrganizer(newOrg);
            }}
          />
        </div>
      </div>
    );
  }

  // Produtor autenticado com cadastro ativo -> Layout do Dashboard com Sidebar
  const navItems = [
    { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'events', label: 'Meus Eventos', icon: Calendar },
    { id: 'events_new', label: 'Criar Evento', icon: PlusCircle },
    { id: 'attendees', label: 'Participantes & Check-in', icon: Users },
    { id: 'settings', label: 'Configurações Financeiras', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      
      {/* Top Navbar Administrativa */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 lg:hidden transition"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Ticket className="w-4 h-4 -rotate-12" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight text-gray-900">
                Nova<span className="text-blue-600">Tickets</span>
              </span>
              <span className="text-[9px] uppercase font-bold text-blue-600 tracking-widest -mt-1">
                Painel do Produtor
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg border border-gray-200 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Ver Vitrine Pública</span>
          </Link>

          <div className="flex items-center gap-2.5 pl-3 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs border border-blue-200">
              {organizer.company_name[0].toUpperCase()}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-bold text-gray-800 leading-tight max-w-[140px] truncate">
                {organizer.company_name}
              </span>
              <span className="text-[10px] text-gray-400 font-mono">
                {organizer.document}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Container Principal com Sidebar e Área de Conteúdo */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        
        {/* Sidebar Desktop */}
        <aside className="hidden lg:block w-64 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 sticky top-24 space-y-2">
            <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Navegação
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isSelected =
                activeTab === item.id ||
                (item.id === 'events' && activeTab.startsWith('event_'));

              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="pt-4 border-t border-gray-100">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-blue-900 space-y-1">
                <span className="font-bold flex items-center gap-1 text-blue-700">
                  <ShieldCheck className="w-3.5 h-3.5" /> Split Automático
                </span>
                <p className="text-[10px] text-blue-700/80 leading-snug">
                  Seus repasses são calculados deduzindo a taxa da plataforma em cada pedido aprovado.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Sidebar Drawer Mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative w-72 bg-white h-full shadow-2xl p-5 flex flex-col justify-between z-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <span className="font-extrabold text-sm text-gray-900">
                    Menu do Produtor
                  </span>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isSelected = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Link
                to="/"
                onClick={() => setSidebarOpen(false)}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl text-center block"
              >
                Voltar à Vitrine
              </Link>
            </div>
          </div>
        )}

        {/* Área Central de Conteúdo */}
        <main className="flex-1 min-w-0">
          {activeTab === 'overview' && (
            <DashboardOverview organizer={organizer} onNavigateToTab={setTab} />
          )}

          {activeTab === 'events' && (
            <EventManager organizer={organizer} initialAction="list" />
          )}

          {activeTab === 'events_new' && (
            <EventManager organizer={organizer} initialAction="new" />
          )}

          {activeTab.startsWith('event_') && (
            <EventManager
              organizer={organizer}
              initialEventId={activeTab.replace('event_', '')}
              initialAction="list"
            />
          )}

          {activeTab === 'attendees' && (
            <AttendeesAndCheckin organizer={organizer} />
          )}

          {activeTab === 'settings' && (
            <FinancialSettings
              organizer={organizer}
              onUpdated={(updatedOrg) => setOrganizer(updatedOrg)}
            />
          )}
        </main>
      </div>
    </div>
  );
};
