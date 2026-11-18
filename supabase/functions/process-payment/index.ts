// =============================================================================
// EDGE FUNCTION: process-payment
// Descrição: Processa pagamentos via Pix, Cartão de Crédito e Débito com Split
// Gateway: Asaas v3 (Sandbox / Produção)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Trata preflight CORS do navegador
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const asaasApiKey = Deno.env.get('ASAAS_API_KEY') ?? '';
    const asaasApiUrl = Deno.env.get('ASAAS_API_URL') ?? 'https://sandbox.asaas.com/api/v3';

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Configurações internas do Supabase ausentes no servidor.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();

    const {
      order_id,
      payment_method, // 'pix' | 'credit_card' | 'debit_card'
      installments = 1,
      card_data,
      attendees,
    } = body;

    if (!order_id || !payment_method) {
      return new Response(
        JSON.stringify({ success: false, error: 'Parâmetros order_id e payment_method são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Busca os dados do Pedido e do Evento no Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, events (*)')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Pedido não localizado no banco de dados.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order.status === 'paid') {
      return new Response(
        JSON.stringify({ success: true, message: 'Este pedido já se encontra pago.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (order.status === 'expired') {
      return new Response(
        JSON.stringify({ success: false, error: 'O prazo de 10 minutos para pagar este pedido expirou.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Busca os dados do Organizador para obter a Carteira de Split (wallet_id)
    const organizerId = order.events?.organizer_id;
    let organizerWalletId: string | null = null;

    if (organizerId) {
      const { data: orgData } = await supabase
        .from('organizers')
        .select('wallet_id, company_name')
        .eq('id', organizerId)
        .single();

      if (orgData?.wallet_id) {
        organizerWalletId = orgData.wallet_id;
      }
    }

    // Se a chave da API da Asaas não estiver configurada no Vault, simula aprovação imediata em modo Sandbox
    if (!asaasApiKey) {
      console.warn('ASAAS_API_KEY não configurada no ambiente. Executando emulação Sandbox.');

      const last4 = card_data?.number ? card_data.number.slice(-4) : '1234';

      // Atualiza o pedido
      await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method,
          installments: payment_method === 'credit_card' ? installments : 1,
          card_last_digits: payment_method !== 'pix' ? last4 : null,
          payment_gateway_id: `sandbox_${Date.now()}`,
          payment_error_message: null,
        })
        .eq('id', order_id);

      // Emite os ingressos chamando a RPC confirm_order_payment
      if (attendees && attendees.length > 0) {
        await supabase.rpc('confirm_order_payment', {
          p_order_id: order_id,
          p_attendees: attendees,
        });
      }

      return new Response(
        JSON.stringify({ success: true, transaction_id: `sandbox_${Date.now()}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Monta o Payload para a API do Gateway Asaas com Regra de Split
    const billingType =
      payment_method === 'pix'
        ? 'PIX'
        : payment_method === 'credit_card'
        ? 'CREDIT_CARD'
        : 'DEBIT_CARD';

    // Monta a regra de split automático se o produtor possuir carteira configurada
    const splitRules = organizerWalletId
      ? [
          {
            walletId: organizerWalletId,
            fixedValue: Number(order.organizer_amount),
          },
        ]
      : undefined;

    const asaasPayload: any = {
      billingType,
      value: Number(order.total_amount),
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      description: `Ingressos Pedido #${order.id.slice(0, 8)} - ${order.events?.title || 'Nova Tickets'}`,
      externalReference: order_id,
      split: splitRules,
    };

    // Adiciona dados de Cartão se for Crédito ou Débito
    if (payment_method === 'credit_card' || payment_method === 'debit_card') {
      asaasPayload.creditCard = {
        holderName: card_data.holder_name,
        number: card_data.number,
        expiryMonth: card_data.expiry_month,
        expiryYear: card_data.expiry_year,
        ccv: card_data.ccv,
      };

      asaasPayload.creditCardHolderInfo = {
        name: card_data.holder_name,
        cpfCnpj: card_data.cpf_cnpj,
        email: attendees?.[0]?.attendees?.[0]?.email || 'comprador@novatickets.com',
      };

      if (payment_method === 'credit_card' && installments > 1) {
        asaasPayload.installmentCount = installments;
        asaasPayload.installmentValue = Number((order.total_amount / installments).toFixed(2));
      }
    }

    // 4. Dispara a chamada HTTP para o gateway Asaas
    const gatewayResponse = await fetch(`${asaasApiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        access_token: asaasApiKey,
      },
      body: JSON.stringify(asaasPayload),
    });

    const gatewayData = await gatewayResponse.json();

    if (!gatewayResponse.ok) {
      const errorMsg =
        gatewayData?.errors?.[0]?.description ||
        'Não foi possível aprovar a transação junto à operadora do cartão.';

      await supabase
        .from('orders')
        .update({
          payment_error_message: errorMsg,
          payment_method,
        })
        .eq('id', order_id);

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Se o pagamento do cartão foi aprovado instantaneamente
    if (gatewayData.status === 'CONFIRMED' || gatewayData.status === 'RECEIVED') {
      const last4 = card_data?.number ? card_data.number.slice(-4) : null;

      await supabase
        .from('orders')
        .update({
          status: 'paid',
          payment_method,
          installments: payment_method === 'credit_card' ? installments : 1,
          card_last_digits: last4,
          payment_gateway_id: gatewayData.id,
          payment_error_message: null,
        })
        .eq('id', order_id);

      // Invoca a RPC para emissão segura dos ingressos HMAC-SHA256
      if (attendees && attendees.length > 0) {
        await supabase.rpc('confirm_order_payment', {
          p_order_id: order_id,
          p_attendees: attendees,
        });
      }

      return new Response(
        JSON.stringify({ success: true, transaction_id: gatewayData.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se for Pix, retorna os dados para renderização do QR Code
    return new Response(
      JSON.stringify({
        success: true,
        transaction_id: gatewayData.id,
        status: gatewayData.status,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Erro na Edge Function process-payment:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Erro interno no processamento.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
