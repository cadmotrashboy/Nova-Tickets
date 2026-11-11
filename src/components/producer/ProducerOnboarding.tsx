import React, { useState } from 'react';
import { Building2, ShieldCheck, CreditCard, Sparkles, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { formatDocument } from '../../utils/formatters';
import type { Organizer } from '../../types/database';

interface ProducerOnboardingProps {
  onSuccess: (organizer: Organizer) => void;
}

export const ProducerOnboarding: React.FC<ProducerOnboardingProps> = ({ onSuccess }) => {
  const { user, profile } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [document, setDocument] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!user) {
      setErrorMessage('Você precisa estar autenticado para criar seu perfil de produtor.');
      return;
    }

    const cleanDoc = document.replace(/\D/g, '');
    if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
      setErrorMessage('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
      return;
    }

    if (!companyName.trim()) {
      setErrorMessage('Informe o nome da sua empresa, produtora ou seu nome artístico.');
      return;
    }

    if (!pixKey.trim()) {
      setErrorMessage('Informe uma chave Pix válida para receber os repasses de vendas.');
      return;
    }

    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        // Fallback para desenvolvimento offline
        const mockOrg: Organizer = {
          id: `org-${Date.now()}`,
          user_id: user.id,
          company_name: companyName.trim(),
          document: formatDocument(cleanDoc),
          wallet_id: null,
          pix_key: pixKey.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        localStorage.setItem(`producer_org_${user.id}`, JSON.stringify(mockOrg));
        onSuccess(mockOrg);
        return;
      }

      // 1. Cria o registro na tabela organizers do Supabase
      const { data: newOrg, error: orgError } = await supabase
        .from('organizers')
        .insert({
          user_id: user.id,
          company_name: companyName.trim(),
          document: formatDocument(cleanDoc),
          pix_key: pixKey.trim(),
        })
        .select()
        .single();

      if (orgError) {
        if (orgError.code === '23505') {
          throw new Error('Este CPF ou CNPJ já está cadastrado como produtor na plataforma.');
        }
        throw new Error(orgError.message || 'Erro ao registrar perfil de organizador.');
      }

      // 2. Atualiza o perfil do usuário para role = 'organizer'
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: 'organizer' })
        .eq('id', user.id);

      if (profileError) {
        console.warn('Aviso: Perfil de usuário não pôde ser promovido para role organizer:', profileError);
      }

      onSuccess(newOrg as Organizer);
    } catch (err: any) {
      console.error('Falha no onboarding de produtor:', err);
      setErrorMessage(err.message || 'Ocorreu um erro ao salvar suas informações. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
        {/* Banner de Boas-vindas */}
        <div className="bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 p-8 text-white relative">
          <div className="flex items-center gap-2 mb-3">
            <span className="p-2 bg-white/10 rounded-xl backdrop-blur-sm">
              <Sparkles className="w-5 h-5 text-blue-300" />
            </span>
            <span className="text-xs uppercase font-extrabold tracking-widest text-blue-200">
              Painel do Produtor
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Ative sua Conta de Produtor
          </h2>
          <p className="text-sm text-blue-100 mt-2 leading-relaxed">
            Cadastre seus dados para começar a publicar eventos, gerenciar lotes de ingressos com controle atômico de estoque e receber repasses automáticos via Pix.
          </p>
        </div>

        {/* Formulário */}
        <div className="p-6 sm:p-8">
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Atenção ao preencher</p>
                <p className="text-xs mt-0.5 text-red-600">{errorMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Nome da Empresa, Produtora ou Nome Artístico *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Nova Live Entretenimento Ltda"
                  className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Este nome será exibido nos seus eventos e bilhetes oficiais.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                CPF ou CNPJ do Organizador *
              </label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  maxLength={18}
                  value={document}
                  onChange={(e) => setDocument(formatDocument(e.target.value))}
                  placeholder="00.000.000/0001-00 ou 000.000.000-00"
                  className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Documento fiscal obrigatório para split e emissão dos ingressos.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Chave Pix para Repasses *
              </label>
              <div className="relative">
                <CreditCard className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="CPF, CNPJ, E-mail, Celular ou Chave Aleatória"
                  className="w-full pl-10 pr-3.5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Chave utilizada para transferir o valor líquido de suas vendas.
              </p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Configurando sua conta de produtor...</span>
                  </>
                ) : (
                  <>
                    <span>Concluir Cadastro e Acessar Painel</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
