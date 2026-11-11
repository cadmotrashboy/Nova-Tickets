import React from 'react';
import { Ticket, Heart, ShieldCheck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 text-slate-300 pt-16 pb-12 border-t border-slate-800 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <Ticket className="w-4 h-4 -rotate-12" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Nova<span className="text-blue-500">Tickets</span>
              </span>
            </Link>
            <p className="text-xs text-slate-400 leading-relaxed">
              Plataforma completa e moderna de gestão de eventos, bilheteria online, controle de lotes e check-in com QR Code em tempo real.
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <ShieldCheck className="w-4 h-4" /> Pagamento Seguro via Pix
              </span>
            </div>
          </div>

          {/* Links para Compradores */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Para Você
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <Link to="/" className="hover:text-white transition">
                  Explorar Eventos
                </Link>
              </li>
              <li>
                <Link to="/meus-ingressos" className="hover:text-white transition">
                  Meus Ingressos
                </Link>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer transition">
                  Central de Ajuda
                </span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer transition">
                  Termos e Políticas
                </span>
              </li>
            </ul>
          </div>

          {/* Links para Produtores */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Para Produtores
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-400">
              <li>
                <span className="hover:text-white cursor-pointer transition flex items-center gap-1">
                  <span>Criar Evento</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Módulo 2</span>
                </span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer transition flex items-center gap-1">
                  <span>Portaria & Check-in</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Módulo 3</span>
                </span>
              </li>
              <li>
                <span className="hover:text-white cursor-pointer transition">
                  Split Automático & Taxas
                </span>
              </li>
            </ul>
          </div>

          {/* Stack & Tecnologia */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Tecnologia & Segurança
            </h4>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                <Zap className="w-4 h-4" />
                <span>Supabase PostgreSQL + RLS</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Reserva com locks atômicos, prevenção de overselling e emissão com HMAC-SHA256.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2026 Nova Tickets. Todos os direitos reservados.</p>
          <p className="flex items-center gap-1 text-slate-400">
            Desenvolvido com excelência técnica <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </p>
        </div>
      </div>
    </footer>
  );
};

