import React, { useState } from 'react';
import { Building2, ShieldCheck, CreditCard, Wallet, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Organizer } from '../../types/database';
import { formatDocument } from '../../utils/formatters';

interface FinancialSettingsProps {
  organizer: Organizer;
  onUpdated: (org: Organizer) => void;
}

export const FinancialSettings: React.FC<FinancialSettingsProps> = ({ organizer, onUpdated }) => {
  const [companyName, setCompanyName] = useState(organizer.company_name);
  const [document, setDocument] = useState(organizer.document);
  const [pixKey, setPixKey] = useState(organizer.pix_key || '');
  const [walletId, setWalletId] = useState(organizer.wallet_id || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccess(false);

    try {
      if (!isSupabaseConfigured) {
        const updated = {
          ...organizer,
          company_name: companyName,
          document,
          pix_key: pixKey,
          wallet_id: walletId || null,
        };
        onUpdated(updated);
        setSuccess(true);
        return;
      }

      const { data, error } = await supabase
        .from('organizers')
        .update({
          company_name: companyName.trim(),
          document: document.trim(),
          pix_key: pixKey.trim() || null,
          wallet_id: walletId.trim() || null,
        })
        .eq('id', organizer.id)
        .select()
        .single();

      if (error) throw error;

      setSuccess(true);
      if (data) {
        onUpdated(data as Organizer);
      }
    } catch (err: any) {
      console.error('Erro ao salvar dados financeiros:', err);
      setErrorMsg(err.message || 'Falha ao atualizar dados.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">
            Configurações Financeiras & Repasses
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Mantenha seus dados cadastrais e chave Pix atualizados para receber os repasses líquidos das vendas de ingressos.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Aviso</p>
              <p className="text-xs mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-700 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Dados atualizados com sucesso!</p>
              <p className="text-xs mt-0.5">Suas alterações foram salvas com segurança no banco.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Razão Social ou Nome do Produtor *
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              CPF ou CNPJ *
            </label>
            <div className="relative">
              <ShieldCheck className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={document}
                onChange={(e) => setDocument(formatDocument(e.target.value))}
                className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Chave Pix Cadastrada para Repasse *
            </label>
            <div className="relative">
              <CreditCard className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition font-mono"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Os valores correspondentes a <code>organizer_amount</code> são transferidos para esta chave.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              ID da Carteira no Gateway (Wallet ID / Split)
            </label>
            <div className="relative">
              <Wallet className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={walletId}
                onChange={(e) => setWalletId(e.target.value)}
                placeholder="Ex: rec_cl9876543210 (opcional)"
                className="w-full pl-10 pr-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-600 transition font-mono"
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Identificador da conta recebedora na gateway de pagamento para split automático em D+2.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando dados...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Configurações</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

