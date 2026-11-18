// =============================================================================
// EDGE FUNCTION: payment-webhook
// Descrição: Recebe webhooks de pagamento (Pix / Boleto / Cartão) do gateway Asaas
// e dispara a emissão de ingressos no Supabase em tempo real.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

serve(async (req: Request) => {
  // Apenas aceita método POST
  if (req.method !== 'POST') {
    return new Response('Método não permitido', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const webhookSecret = Deno.env.get('ASAAS_WEBHOOK_SECRET') ?? '';

    // Validação de segurança do token do webhook se configurado
    const receivedToken = req.headers.get('asaas-access-token');
    if (webhookSecret && receivedToken !== webhookSecret) {
      console.warn('Assinatura do webhook inválida ou não autorizada.');
      return new Response('Acesso não autorizado', { status: 401 });
    }

    const payload = await req.json();
    console.log('Webhook Asaas recebido:', payload.event, payload.payment?.id);

    const eventType = payload.event; // 'PAYMENT_CONFIRMED' | 'PAYMENT_RECEIVED'
    const payment = payload.payment;

    if (!payment) {
      return new Response('Payload sem objeto de pagamento', { status: 400 });
    }

    // Apenas processa pagamentos confirmados ou recebidos
    if (eventType !== 'PAYMENT_CONFIRMED' && eventType !== 'PAYMENT_RECEIVED') {
      return new Response(JSON.stringify({ ignored: true, reason: 'Evento não conclusivo' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const orderId = payment.externalReference;
    const paymentId = payment.id;

    // 1. Localiza o pedido correspondente pelo orderId ou payment_gateway_id
    let query = supabase.from('orders').select('*, order_items(*)');

    if (orderId) {
      query = query.eq('id', orderId);
    } else {
      query = query.eq('payment_gateway_id', paymentId);
    }

    const { data: order, error: orderError } = await query.maybeSingle();

    if (orderError || !order) {
      console.error('Pedido não encontrado para o webhook:', orderId, paymentId);
      return new Response('Pedido não encontrado', { status: 404 });
    }

    // Se já estiver pago, retorna 200 sem reprocessar (idempotência)
    if (order.status === 'paid') {
      return new Response(JSON.stringify({ success: true, message: 'Pedido já marcado como pago' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Atualiza o status do pedido para 'paid'
    await supabase
      .from('orders')
      .update({
        status: 'paid',
        payment_gateway_id: paymentId,
        payment_error_message: null,
      })
      .eq('id', order.id);

    console.log(`Pedido #${order.id} atualizado para 'paid' via webhook.`);

    return new Response(JSON.stringify({ success: true, order_id: order.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Erro ao processar webhook:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
