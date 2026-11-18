import React from 'react';
import { CreditCard, Sparkles, ShieldCheck } from 'lucide-react';
import { detectCardBrand } from '../../services/paymentService';

interface InteractiveCardPreviewProps {
  number: string;
  holderName: string;
  expiryMonth: string;
  expiryYear: string;
  isDebit?: boolean;
}

export const InteractiveCardPreview: React.FC<InteractiveCardPreviewProps> = ({
  number,
  holderName,
  expiryMonth,
  expiryYear,
  isDebit = false,
}) => {
  const brand = detectCardBrand(number);
  const cleanNumber = number.replace(/\D/g, '');

  // Formata o número em blocos de 4 dígitos para exibição
  const formatCardDisplay = () => {
    if (!cleanNumber) return '•••• •••• •••• ••••';
    let padded = cleanNumber.padEnd(16, '•');
    return `${padded.slice(0, 4)} ${padded.slice(4, 8)} ${padded.slice(8, 12)} ${padded.slice(12, 16)}`;
  };

  const displayName = holderName.trim() ? holderName.toUpperCase() : 'NOME DO TITULAR';
  const displayExpiry = (expiryMonth || expiryYear)
    ? `${(expiryMonth || 'MM').padStart(2, '0')}/${expiryYear ? expiryYear.slice(-2) : 'AA'}`
    : 'MM/AA';

  return (
    <div className="w-full max-w-sm mx-auto mb-6">
      <div className="relative aspect-[1.586/1] rounded-2xl p-6 text-white shadow-2xl overflow-hidden bg-gradient-to-tr from-slate-900 via-indigo-950 to-blue-900 border border-white/20 select-none">
        
        {/* Efeitos de fundo e reflexo */}
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Linha Superior: Chip EMV e Tipo do Cartão */}
        <div className="flex items-center justify-between relative z-10">
          {/* Chip dourado metálico estilizado */}
          <div className="w-11 h-8 rounded-lg bg-gradient-to-tr from-amber-300 via-amber-400 to-yellow-200 border border-amber-500/40 shadow-inner flex items-center justify-center">
            <div className="w-7 h-5 border border-amber-600/30 rounded-sm grid grid-cols-2 gap-0.5 opacity-60">
              <div className="border-r border-amber-600/30" />
              <div />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest text-blue-200 bg-white/10 px-2 py-0.5 rounded-md backdrop-blur-sm border border-white/10">
              {isDebit ? 'Débito' : 'Crédito'}
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-white">
              {brand === 'unknown' ? 'NovaCard' : brand.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Número do Cartão */}
        <div className="mt-7 relative z-10">
          <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold block mb-1">
            Número do Cartão
          </span>
          <div className="font-mono text-lg sm:text-xl font-extrabold tracking-widest text-slate-100 drop-shadow">
            {formatCardDisplay()}
          </div>
        </div>

        {/* Linha Inferior: Titular e Validade */}
        <div className="mt-5 flex items-end justify-between relative z-10 pt-2 border-t border-white/10">
          <div className="max-w-[70%]">
            <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold block">
              Titular
            </span>
            <span className="text-xs font-bold text-white tracking-wider truncate block leading-tight">
              {displayName}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[8px] uppercase tracking-widest text-slate-400 font-bold block">
              Validade
            </span>
            <span className="font-mono text-xs font-bold text-white tracking-wider">
              {displayExpiry}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
