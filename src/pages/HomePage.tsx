import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  Calendar, 
  MapPin, 
  Ticket, 
  ArrowRight, 
  Sparkles, 
  Search, 
  Filter, 
  Loader2,
  AlertCircle,
  DatabaseZap
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Event } from '../types/database';
import { formatShortDate, formatCurrency } from '../utils/formatters';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';

// Dados de demonstração padrão para quando o banco ainda não tiver registros semeados
const DEMO_EVENTS: (Event & { minPrice?: number })[] = [
  {
    id: 'e1111111-1111-1111-1111-111111111111',
    organizer_id: 'org-1',
    title: 'Festival Sonora Beats 2026',
    slug: 'festival-sonora-beats-2026',
    description: 'O maior festival de música eletrônica e experiências imersivas do Brasil. 3 palcos, mais de 40 atrações internacionais e nacionais.',
    banner_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    location_name: 'Parque Ibirapuera - Pavilhão das Artes',
    address: 'Av. Pedro Álvares Cabral, s/n - Vila Mariana, São Paulo - SP',
    start_date: '2026-11-20T18:00:00-03:00',
    end_date: '2026-11-21T06:00:00-03:00',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    minPrice: 80,
  },
  {
    id: 'e2222222-2222-2222-2222-222222222222',
    organizer_id: 'org-2',
    title: 'Nova Tech Summit 2026',
    slug: 'nova-tech-summit-2026',
    description: 'Conferência líder de inovação, inteligência artificial, engenharia de software e futuro digital com líderes mundiais de tecnologia.',
    banner_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
    location_name: 'Centro de Convenções Frei Caneca',
    address: 'Rua Frei Caneca, 569 - Consolação, São Paulo - SP',
    start_date: '2026-12-05T09:00:00-03:00',
    end_date: '2026-12-06T19:00:00-03:00',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    minPrice: 150,
  },
  {
    id: 'e3333333-3333-3333-3333-333333333333',
    organizer_id: 'org-3',
    title: 'Stand-up Comedy Gala: Noite dos Mestres',
    slug: 'stand-up-comedy-gala-2026',
    description: 'Uma noite inesquecível com os melhores comediantes do país em uma sessão especial de risos, improviso e música ao vivo.',
    banner_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    location_name: 'Teatro Bradesco',
    address: 'R. Palestra Itália, 500 - Perdizes, São Paulo - SP',
    start_date: '2026-11-28T21:00:00-03:00',
    end_date: '2026-11-28T23:30:00-03:00',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    minPrice: 45,
  },
  {
    id: 'e4444444-4444-4444-4444-444444444444',
    organizer_id: 'org-4',
    title: 'Copa Regional de Beach Tennis & Sunset Party',
    slug: 'copa-beach-tennis-sunset-2026',
    description: 'Torneio esportivo com atletas convidados, open bar durante a final e show ao pôr do sol à beira da represa.',
    banner_url: 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=1200&q=80',
    location_name: 'Arena Praia Clube',
    address: 'Av. Atlântica, 1200 - Rio de Janeiro - RJ',
    start_date: '2026-12-12T14:00:00-03:00',
    end_date: '2026-12-12T22:00:00-03:00',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    minPrice: 60,
  },
];

export const HomePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [searchCity, setSearchCity] = useState(searchParams.get('city') || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [isLiveFromDb, setIsLiveFromDb] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      if (!isSupabaseConfigured) {
        // Se ainda não configurado com credenciais válidas, usa demonstração
        setEvents(DEMO_EVENTS);
        setIsLiveFromDb(false);
        setLoading(false);
        return;
      }

      // Consulta oficial conforme CONTEXT.md: eventos published ordenados por start_date
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('status', 'published')
        .order('start_date', { ascending: true });

      if (error) {
        console.warn('Erro ao buscar eventos do Supabase:', error);
        setEvents(DEMO_EVENTS);
        setIsLiveFromDb(false);
      } else if (data && data.length > 0) {
        setEvents(data as Event[]);
        setIsLiveFromDb(true);
      } else {
        // Banco conectado mas sem eventos publicados ainda
        setEvents(DEMO_EVENTS);
        setIsLiveFromDb(false);
      }
    } catch (err) {
      console.error(err);
      setEvents(DEMO_EVENTS);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = events.filter((ev) => {
    const matchesTerm =
      !searchTerm ||
      ev.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ev.description && ev.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCity =
      !searchCity ||
      (ev.address && ev.address.toLowerCase().includes(searchCity.toLowerCase())) ||
      (ev.location_name && ev.location_name.toLowerCase().includes(searchCity.toLowerCase()));

    return matchesTerm && matchesCity;
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar
        onSearch={(term, city) => {
          setSearchTerm(term);
          setSearchCity(city);
        }}
        searchTerm={searchTerm}
        searchCity={searchCity}
      />

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white overflow-hidden py-16 sm:py-24">
        {/* Decorative background glows */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold uppercase tracking-wider mb-6">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>A melhor experiência em compra de ingressos</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight text-white mb-6">
              Viva momentos <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">inesquecíveis</span>. Garanta seu ingresso.
            </h1>

            <p className="text-lg text-slate-300 mb-8 max-w-2xl leading-relaxed">
              Explore shows, festivais, congressos e teatros. Reserva de ingressos em tempo real com segurança antifraude, pagamento rápido via Pix e validação instantânea.
            </p>

            {/* Quick stats badge */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-slate-300 border-t border-slate-800/80 pt-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-semibold text-white">Reserva Garantida</span> por 10 min
              </div>
              <div className="flex items-center gap-2">
                <Ticket className="w-4 h-4 text-blue-400" />
                <span>QR Code Criptografado HMAC-SHA256</span>
              </div>
              <div className="flex items-center gap-2">
                <DatabaseZap className="w-4 h-4 text-amber-400" />
                <span>Confirmação Pix em Tempo Real</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {/* Bar de Filtros Rápidos */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {['todos', 'shows', 'festivais', 'teatro', 'tecnologia', 'gastronomia'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition capitalize ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{filteredEvents.length} eventos disponíveis</span>
            {isLiveFromDb && (
              <span className="ml-2 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                Supabase Live
              </span>
            )}
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
            <p className="text-sm font-medium">Carregando eventos disponíveis...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-200 p-8 max-w-lg mx-auto shadow-sm">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Nenhum evento encontrado</h3>
            <p className="text-sm text-gray-500 mb-6">
              Não encontramos eventos com os critérios informados. Tente limpar os filtros de busca.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSearchCity('');
              }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition"
            >
              Limpar Busca
            </button>
          </div>
        ) : (
          /* Grid de Cards de Eventos */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                to={`/evento/${event.slug}`}
                className="group bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 flex flex-col"
              >
                {/* Banner do Evento */}
                <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
                  <img
                    src={
                      event.banner_url ||
                      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=800&q=80'
                    }
                    alt={event.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  {/* Badge de Data Flutuante */}
                  <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm text-gray-900 px-3 py-1.5 rounded-xl shadow-md border border-white/40 text-xs font-bold flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>{formatShortDate(event.start_date)}</span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 leading-snug mb-2">
                      {event.title}
                    </h3>

                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3 line-clamp-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span>{event.location_name || event.address || 'Local a confirmar'}</span>
                    </div>

                    {event.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-4">
                        {event.description}
                      </p>
                    )}
                  </div>

                  {/* Rodapé do Card */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between mt-auto">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                        Ingressos
                      </span>
                      <span className="text-sm font-extrabold text-gray-900">
                        Disponíveis
                      </span>
                    </div>

                    <div className="w-9 h-9 rounded-xl bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 flex items-center justify-center transition-colors">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

