import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Ticket, 
  Search, 
  MapPin, 
  PlusCircle, 
  User as UserIcon, 
  LogOut, 
  Menu, 
  X,
  Compass
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';

interface NavbarProps {
  onSearch?: (term: string, city: string) => void;
  searchTerm?: string;
  searchCity?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onSearch, 
  searchTerm: initialSearch = '', 
  searchCity: initialCity = '' 
}) => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [term, setTerm] = useState(initialSearch);
  const [city, setCity] = useState(initialCity);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(term, city);
    } else {
      navigate(`/?q=${encodeURIComponent(term)}&city=${encodeURIComponent(city)}`);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20 gap-4">
            
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 flex-shrink-0 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Ticket className="w-5 h-5 -rotate-12" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-gray-900 via-blue-900 to-blue-600 bg-clip-text text-transparent">
                  Nova<span className="text-blue-600">Tickets</span>
                </span>
                <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest -mt-1">
                  Ingressos & Eventos
                </span>
              </div>
            </Link>

            {/* Barra de Busca estilo Sympla (Desktop) */}
            <form 
              onSubmit={handleSearchSubmit}
              className="hidden md:flex items-center flex-1 max-w-xl mx-4 bg-gray-50 hover:bg-gray-100/80 border border-gray-200 focus-within:border-blue-500 focus-within:bg-white rounded-full transition shadow-sm overflow-hidden"
            >
              <div className="flex-1 flex items-center px-4 py-2">
                <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    onSearch?.(e.target.value, city);
                  }}
                  placeholder="Buscar eventos, shows, teatros..."
                  className="w-full bg-transparent text-sm focus:outline-none text-gray-800 placeholder-gray-400"
                />
              </div>

              <div className="h-6 w-[1px] bg-gray-200" />

              <div className="w-44 flex items-center px-4 py-2">
                <MapPin className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                <input
                  type="text"
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    onSearch?.(term, e.target.value);
                  }}
                  placeholder="Cidade"
                  className="w-full bg-transparent text-sm focus:outline-none text-gray-800 placeholder-gray-400"
                />
              </div>

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 m-1 rounded-full transition"
                title="Pesquisar"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>

            {/* Ações à direita */}
            <div className="hidden lg:flex items-center gap-3">
              <Link
                to="/"
                className="text-sm font-semibold text-gray-600 hover:text-blue-600 px-3 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                <Compass className="w-4 h-4" />
                <span>Explorar</span>
              </Link>

              <Link
                to="/meus-ingressos"
                className="text-sm font-semibold text-gray-600 hover:text-blue-600 px-3 py-2 rounded-lg transition flex items-center gap-1.5"
              >
                <Ticket className="w-4 h-4" />
                <span>Meus Ingressos</span>
              </Link>

              <Link
                to="/dashboard"
                className="text-sm font-semibold text-gray-700 hover:text-blue-600 px-3.5 py-2 border border-gray-200 rounded-xl hover:border-blue-400 transition flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4 text-blue-600" />
                <span>Painel do Produtor</span>
              </Link>

              {user ? (
                <div className="flex items-center gap-3 pl-2 border-l border-gray-200">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm border border-blue-200">
                      {(profile?.full_name || user.email || 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="text-xs font-bold text-gray-800 leading-tight max-w-[120px] truncate">
                        {profile?.full_name || user.email?.split('@')[0]}
                      </span>
                      <span className="text-[10px] text-gray-600 font-medium capitalize">
                        {profile?.role || 'Comprador'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => signOut()}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Sair da Conta"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:shadow transition flex items-center gap-2"
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Entrar</span>
                </button>
              )}
            </div>

            {/* Botão Menu Mobile */}
            <div className="flex items-center gap-2 lg:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>

          {/* Busca no Mobile */}
          <div className="pb-3 md:hidden">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={term}
                  onChange={(e) => {
                    setTerm(e.target.value);
                    onSearch?.(e.target.value, city);
                  }}
                  placeholder="Buscar eventos..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                Buscar
              </button>
            </form>
          </div>
        </div>

        {/* Menu Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white px-4 py-4 space-y-3">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 py-2 text-sm font-semibold text-gray-700"
            >
              <Compass className="w-4 h-4 text-blue-600" />
              <span>Explorar Eventos</span>
            </Link>

            <Link
              to="/meus-ingressos"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 py-2 text-sm font-semibold text-gray-700"
            >
              <Ticket className="w-4 h-4 text-blue-600" />
              <span>Meus Ingressos</span>
            </Link>

            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              <PlusCircle className="w-4 h-4 text-blue-600" />
              <span>Painel do Produtor</span>
            </Link>

            {user ? (
              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                    {(profile?.full_name || user.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800">
                      {profile?.full_name || user.email}
                    </div>
                    <div className="text-[10px] text-gray-500">{user.email}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAuthOpen(true);
                }}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold shadow"
              >
                Entrar na Conta
              </button>
            )}
          </div>
        )}
      </header>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
};

