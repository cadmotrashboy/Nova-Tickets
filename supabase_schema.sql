-- =============================================================================
-- PLATAFORMA DE INGRESSOS - SCHEMA COMPLETO SUPABASE/POSTGRESQL
-- Versão: 1.0.0 | Data: 2026-11-05
-- =============================================================================
-- Instruções: Execute este script no SQL Editor do Supabase.
-- Pré-requisito: A extensão pgcrypto será habilitada pelo script.
-- =============================================================================


-- =============================================================================
-- SEÇÃO 1: EXTENSÕES
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- SEÇÃO 2: TABELAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 PROFILES
-- Estende o auth.users do Supabase com dados do perfil público do usuário.
-- Um trigger cria automaticamente um profile ao criar um usuário no Auth.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT        NOT NULL,
    cpf         TEXT        UNIQUE,
    phone       TEXT,
    email       TEXT        NOT NULL,
    role        TEXT        NOT NULL DEFAULT 'buyer'
                            CHECK (role IN ('buyer', 'organizer', 'admin')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfis públicos dos usuários, vinculados ao auth.users.';
COMMENT ON COLUMN public.profiles.role IS 'buyer = comprador, organizer = produtor, admin = administrador da plataforma.';

-- -----------------------------------------------------------------------------
-- 2.2 ORGANIZERS
-- Dados do produtor de eventos. Um usuário com role=organizer pode ter
-- exatamente um registro aqui. wallet_id é o identificador na gateway de
-- pagamento para fazer split automático.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizers (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_name    TEXT        NOT NULL,
    document        TEXT        NOT NULL UNIQUE, -- CNPJ ou CPF da pessoa jurídica/física
    wallet_id       TEXT,                        -- ID na gateway (ex: Pagar.me recipient_id)
    pix_key         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.organizers IS 'Perfil de produtor/organizador de eventos.';
COMMENT ON COLUMN public.organizers.wallet_id IS 'ID da carteira na gateway de pagamento para split automático.';

-- -----------------------------------------------------------------------------
-- 2.3 EVENTS
-- Tabela central dos eventos. O slug é único e usado em URLs amigáveis.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id    UUID        NOT NULL REFERENCES public.organizers(id) ON DELETE RESTRICT,
    title           TEXT        NOT NULL,
    slug            TEXT        NOT NULL UNIQUE,
    description     TEXT,
    banner_url      TEXT,
    location_name   TEXT,
    address         TEXT,
    start_date      TIMESTAMPTZ NOT NULL,
    end_date        TIMESTAMPTZ NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'published', 'cancelled', 'finished')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT events_dates_check CHECK (end_date > start_date)
);

COMMENT ON TABLE public.events IS 'Eventos cadastrados pelos organizadores.';
COMMENT ON COLUMN public.events.slug IS 'Identificador único para URL. Ex: show-do-metallica-sp-2026.';
COMMENT ON COLUMN public.events.status IS 'draft=rascunho, published=publicado, cancelled=cancelado, finished=encerrado.';

-- -----------------------------------------------------------------------------
-- 2.4 TICKET_BATCHES
-- Lotes de ingressos de um evento. Um evento pode ter múltiplos lotes
-- (ex: 1º Lote R$50, 2º Lote R$80, VIP R$150).
-- available_quantity é decrementado na reserva e restaurado na expiração.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_batches (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    name                TEXT        NOT NULL,
    price               NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    fee_percentage      NUMERIC(5, 2)  NOT NULL DEFAULT 0 CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
    total_quantity      INTEGER     NOT NULL CHECK (total_quantity > 0),
    available_quantity  INTEGER     NOT NULL CHECK (available_quantity >= 0),
    sales_start         TIMESTAMPTZ NOT NULL,
    sales_end           TIMESTAMPTZ NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'paused', 'sold_out', 'closed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT batches_quantity_check CHECK (available_quantity <= total_quantity),
    CONSTRAINT batches_dates_check    CHECK (sales_end > sales_start)
);

COMMENT ON TABLE public.ticket_batches IS 'Lotes de ingressos de cada evento com controle de estoque.';
COMMENT ON COLUMN public.ticket_batches.fee_percentage IS 'Taxa da plataforma sobre este lote. Ex: 10 = 10%.';
COMMENT ON COLUMN public.ticket_batches.available_quantity IS 'Estoque disponível em tempo real (decrementado na reserva, restaurado na expiração).';

-- -----------------------------------------------------------------------------
-- 2.5 ORDERS
-- Pedido de compra criado no momento da reserva. Expira em 10 minutos se
-- não for pago. Armazena os dados do PIX gerado pela gateway.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    event_id                UUID        NOT NULL REFERENCES public.events(id)   ON DELETE RESTRICT,
    total_amount            NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    platform_fee_amount     NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee_amount >= 0),
    organizer_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (organizer_amount >= 0),
    status                  TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
    payment_gateway_id      TEXT,       -- ID da transação na gateway (ex: tr_xxxxxxxxxxx)
    pix_qr_code             TEXT,       -- QR Code em base64
    pix_copy_paste          TEXT,       -- Código copia-e-cola do PIX
    expires_at              TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.orders IS 'Pedidos de compra de ingressos. Expiram automaticamente se não pagos.';
COMMENT ON COLUMN public.orders.expires_at IS 'Prazo de pagamento. Após este timestamp o pedido é expirado e o estoque devolvido.';
COMMENT ON COLUMN public.orders.platform_fee_amount IS 'Valor retido pela plataforma (calculado de fee_percentage).';
COMMENT ON COLUMN public.orders.organizer_amount IS 'Valor líquido a ser repassado ao organizador.';

-- -----------------------------------------------------------------------------
-- 2.6 ORDER_ITEMS
-- Itens individuais de um pedido. Um pedido pode conter ingressos de
-- diferentes lotes do mesmo evento.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL REFERENCES public.orders(id)        ON DELETE CASCADE,
    batch_id    UUID        NOT NULL REFERENCES public.ticket_batches(id) ON DELETE RESTRICT,
    quantity    INTEGER     NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.order_items IS 'Itens de cada pedido, referenciando lote e quantidade comprada.';

-- -----------------------------------------------------------------------------
-- 2.7 TICKETS
-- Ingressos individuais, gerados APENAS após confirmação do pagamento.
-- Cada ingresso tem um qr_code_hash único e seguro para validação na portaria.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tickets (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID        NOT NULL REFERENCES public.orders(id)        ON DELETE RESTRICT,
    event_id        UUID        NOT NULL REFERENCES public.events(id)        ON DELETE RESTRICT,
    batch_id        UUID        NOT NULL REFERENCES public.ticket_batches(id) ON DELETE RESTRICT,
    owner_name      TEXT        NOT NULL,
    owner_cpf       TEXT        NOT NULL,
    owner_email     TEXT        NOT NULL,
    qr_code_hash    TEXT        NOT NULL UNIQUE, -- HMAC-SHA256 gerado via pgcrypto
    status          TEXT        NOT NULL DEFAULT 'valid'
                                CHECK (status IN ('valid', 'used', 'cancelled')),
    checked_in_at   TIMESTAMPTZ,
    checked_in_by   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tickets IS 'Ingressos individuais emitidos após confirmação de pagamento.';
COMMENT ON COLUMN public.tickets.qr_code_hash IS 'Hash HMAC-SHA256 único para validação do QR Code na portaria.';
COMMENT ON COLUMN public.tickets.checked_in_by IS 'ID do operador de portaria que realizou o check-in.';


-- =============================================================================
-- SEÇÃO 3: TRIGGERS DE AUTOMAÇÃO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 Trigger: auto-create profile ao criar usuário no Auth
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3.2 Trigger: atualiza updated_at automaticamente em todas as tabelas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_profiles
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_organizers
    BEFORE UPDATE ON public.organizers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_events
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_ticket_batches
    BEFORE UPDATE ON public.ticket_batches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_orders
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_tickets
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- SEÇÃO 4: FUNÇÕES RPC
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 reserve_tickets
--
-- Reserva ingressos de forma atômica e segura contra overselling.
--
-- Parâmetros:
--   p_user_id  UUID  - ID do usuário comprando
--   p_event_id UUID  - ID do evento
--   p_items    JSONB - Array de objetos: [{"batch_id": "uuid", "quantity": N}]
--
-- Retorno: UUID do order_id criado
--
-- Fluxo:
--   1. Trava as linhas dos lotes solicitados com FOR UPDATE (bloqueia concorrência)
--   2. Verifica se available_quantity >= quantity para TODOS os lotes
--   3. Decrementa available_quantity de cada lote
--   4. Calcula total, taxa da plataforma e valor do organizador
--   5. Cria o pedido com status 'pending' e expires_at = NOW() + 10min
--   6. Cria os order_items
--   7. Retorna o order_id
--   Em qualquer falha: ROLLBACK total via RAISE EXCEPTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_user_id  UUID,
    p_event_id UUID,
    p_items    JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id          UUID;
    v_total_amount      NUMERIC(10,2) := 0;
    v_platform_fee      NUMERIC(10,2) := 0;
    v_organizer_amount  NUMERIC(10,2) := 0;
    v_item              JSONB;
    v_batch             RECORD;
    v_item_batch_id     UUID;
    v_item_quantity     INTEGER;
    v_item_total        NUMERIC(10,2);
    v_item_fee          NUMERIC(10,2);
BEGIN
    -- Validação básica: p_items não pode ser nulo ou vazio
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Lista de itens não pode ser vazia.';
    END IF;

    -- Itera sobre cada item e trava o lote correspondente com FOR UPDATE.
    -- O FOR UPDATE aqui é feito lote a lote para permitir a verificação
    -- inline de estoque antes de prosseguir.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_batch_id := (v_item->>'batch_id')::UUID;
        v_item_quantity := (v_item->>'quantity')::INTEGER;

        -- Validação do item
        IF v_item_quantity IS NULL OR v_item_quantity <= 0 THEN
            RAISE EXCEPTION 'Quantidade inválida para o lote %.', v_item_batch_id;
        END IF;

        -- Busca e trava a linha do lote (impede leitura/escrita concorrente)
        SELECT tb.*
        INTO v_batch
        FROM public.ticket_batches tb
        WHERE tb.id = v_item_batch_id
          AND tb.event_id = p_event_id
        FOR UPDATE;

        -- Verifica se o lote existe e pertence ao evento
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Lote % não encontrado para o evento %.', v_item_batch_id, p_event_id;
        END IF;

        -- Verifica se o lote está ativo para vendas
        IF v_batch.status != 'active' THEN
            RAISE EXCEPTION 'O lote "%" não está disponível para venda (status: %).', v_batch.name, v_batch.status;
        END IF;

        -- Verifica se as datas de venda são válidas
        IF NOW() < v_batch.sales_start THEN
            RAISE EXCEPTION 'As vendas para o lote "%" ainda não iniciaram.', v_batch.name;
        END IF;

        IF NOW() > v_batch.sales_end THEN
            RAISE EXCEPTION 'As vendas para o lote "%" foram encerradas.', v_batch.name;
        END IF;

        -- VERIFICAÇÃO CRÍTICA DE ESTOQUE
        IF v_batch.available_quantity < v_item_quantity THEN
            RAISE EXCEPTION 'Estoque insuficiente no lote "%". Disponível: %, Solicitado: %.',
                v_batch.name, v_batch.available_quantity, v_item_quantity;
        END IF;

        -- Decrementa o estoque imediatamente (dentro da transação)
        UPDATE public.ticket_batches
        SET available_quantity = available_quantity - v_item_quantity,
            status = CASE
                        WHEN (available_quantity - v_item_quantity) = 0 THEN 'sold_out'
                        ELSE status
                     END
        WHERE id = v_item_batch_id;

        -- Acumula os valores financeiros
        v_item_total   := v_batch.price * v_item_quantity;
        v_item_fee     := ROUND(v_item_total * (v_batch.fee_percentage / 100.0), 2);

        v_total_amount     := v_total_amount     + v_item_total;
        v_platform_fee     := v_platform_fee     + v_item_fee;
    END LOOP;

    -- Calcula o valor líquido do organizador
    v_organizer_amount := v_total_amount - v_platform_fee;

    -- Cria o pedido com expiração de 10 minutos
    INSERT INTO public.orders (
        user_id,
        event_id,
        total_amount,
        platform_fee_amount,
        organizer_amount,
        status,
        expires_at
    )
    VALUES (
        p_user_id,
        p_event_id,
        v_total_amount,
        v_platform_fee,
        v_organizer_amount,
        'pending',
        NOW() + INTERVAL '10 minutes'
    )
    RETURNING id INTO v_order_id;

    -- Cria os itens do pedido
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_batch_id := (v_item->>'batch_id')::UUID;
        v_item_quantity := (v_item->>'quantity')::INTEGER;

        SELECT price INTO v_batch FROM public.ticket_batches WHERE id = v_item_batch_id;

        INSERT INTO public.order_items (order_id, batch_id, quantity, unit_price)
        VALUES (v_order_id, v_item_batch_id, v_item_quantity, v_batch.price);
    END LOOP;

    RETURN v_order_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Qualquer erro provoca rollback automático da transação inteira
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.reserve_tickets IS
'Reserva ingressos atomicamente com SELECT FOR UPDATE para evitar overselling. Retorna o order_id criado.';

-- -----------------------------------------------------------------------------
-- 4.2 expire_unpaid_orders
--
-- Expira pedidos pendentes cujo prazo de pagamento passou.
-- Deve ser chamada periodicamente (ex: via pg_cron a cada 1 minuto,
-- ou via Edge Function com cron schedule no Supabase).
--
-- Retorno: INTEGER com o número de pedidos expirados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expired_order     RECORD;
    v_order_item        RECORD;
    v_expired_count     INTEGER := 0;
BEGIN
    -- Busca todos os pedidos pendentes vencidos
    FOR v_expired_order IN
        SELECT id
        FROM public.orders
        WHERE status = 'pending'
          AND expires_at < NOW()
        FOR UPDATE SKIP LOCKED -- Ignora linhas travadas por outras transações concorrentes
    LOOP
        -- Devolve o estoque de cada item do pedido
        FOR v_order_item IN
            SELECT batch_id, quantity
            FROM public.order_items
            WHERE order_id = v_expired_order.id
        LOOP
            UPDATE public.ticket_batches
            SET available_quantity = available_quantity + v_order_item.quantity,
                status = CASE
                            WHEN status = 'sold_out' THEN 'active'
                            ELSE status
                         END
            WHERE id = v_order_item.batch_id;
        END LOOP;

        -- Marca o pedido como expirado
        UPDATE public.orders
        SET status = 'expired'
        WHERE id = v_expired_order.id;

        v_expired_count := v_expired_count + 1;
    END LOOP;

    RETURN v_expired_count;
END;
$$;

COMMENT ON FUNCTION public.expire_unpaid_orders IS
'Expira pedidos não pagos dentro do prazo e devolve o estoque. Executar periodicamente via cron.';

-- -----------------------------------------------------------------------------
-- 4.3 confirm_order_payment
--
-- Confirma o pagamento de um pedido e emite os ingressos individuais.
-- Chamada pelo Webhook da gateway de pagamento via Edge Function.
--
-- Parâmetros:
--   p_order_id   UUID  - ID do pedido confirmado
--   p_attendees  JSONB - Array de participantes por item do pedido:
--                        [{"batch_id": "uuid", "attendees": [
--                            {"name": "João", "cpf": "000.000.000-00", "email": "j@e.com"}
--                        ]}]
--
-- Fluxo:
--   1. Valida que o pedido existe e está em status 'pending'
--   2. Atualiza o status para 'paid'
--   3. Para cada participante informado, gera um ingresso com qr_code_hash
--      usando HMAC-SHA256(ticket_id || order_id, app_secret)
--   4. Retorna TRUE em caso de sucesso
--
-- IMPORTANTE: Substitua 'SUA_CHAVE_SECRETA_AQUI' por uma chave forte.
-- Guarde esta chave no Vault do Supabase (Settings > Vault).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
    p_order_id   UUID,
    p_attendees  JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order         RECORD;
    v_batch_group   JSONB;
    v_attendee      JSONB;
    v_batch_id      UUID;
    v_ticket_id     UUID;
    v_qr_hash       TEXT;
    v_app_secret    TEXT := 'SUA_CHAVE_SECRETA_AQUI'; -- SUBSTITUA E MOVA PARA O VAULT
BEGIN
    -- Busca e trava o pedido
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido % não encontrado.', p_order_id;
    END IF;

    -- Idempotência: se já foi pago, retorna TRUE sem erro
    IF v_order.status = 'paid' THEN
        RETURN TRUE;
    END IF;

    -- Só confirma pedidos em status 'pending'
    IF v_order.status != 'pending' THEN
        RAISE EXCEPTION 'Pedido % não pode ser confirmado (status atual: %).', p_order_id, v_order.status;
    END IF;

    -- Atualiza o pedido para 'paid'
    UPDATE public.orders
    SET status = 'paid'
    WHERE id = p_order_id;

    -- Itera sobre os grupos de lote com seus participantes
    FOR v_batch_group IN SELECT * FROM jsonb_array_elements(p_attendees)
    LOOP
        v_batch_id := (v_batch_group->>'batch_id')::UUID;

        -- Itera sobre cada participante do lote
        FOR v_attendee IN SELECT * FROM jsonb_array_elements(v_batch_group->'attendees')
        LOOP
            -- Gera um UUID para o ingresso antes de inserir, para usá-lo no hash
            v_ticket_id := gen_random_uuid();

            -- Gera o QR Code Hash: HMAC-SHA256(ticket_id::text || order_id::text, secret)
            -- encode(..., 'hex') converte o bytea para string hexadecimal legível
            v_qr_hash := encode(
                hmac(
                    v_ticket_id::TEXT || p_order_id::TEXT,
                    v_app_secret,
                    'sha256'
                ),
                'hex'
            );

            -- Insere o ingresso individual
            INSERT INTO public.tickets (
                id,
                order_id,
                event_id,
                batch_id,
                owner_name,
                owner_cpf,
                owner_email,
                qr_code_hash,
                status
            )
            VALUES (
                v_ticket_id,
                p_order_id,
                v_order.event_id,
                v_batch_id,
                v_attendee->>'name',
                v_attendee->>'cpf',
                v_attendee->>'email',
                v_qr_hash,
                'valid'
            );
        END LOOP;
    END LOOP;

    RETURN TRUE;

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

COMMENT ON FUNCTION public.confirm_order_payment IS
'Confirma pagamento e emite ingressos com QR Code Hash HMAC-SHA256. Chamada pelo webhook da gateway.';


-- =============================================================================
-- SEÇÃO 5: ÍNDICES DE PERFORMANCE
-- =============================================================================

-- Busca de evento por slug (usado em todas as páginas públicas de evento)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug
    ON public.events (slug);

-- Validação de ingresso por QR Code na portaria (consulta frequente e crítica)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_qr_code_hash
    ON public.tickets (qr_code_hash);

-- Listagem de ingressos por evento (painel do organizador / portaria)
CREATE INDEX IF NOT EXISTS idx_tickets_event_id
    ON public.tickets (event_id);

-- Listagem de pedidos por usuário (área do comprador)
CREATE INDEX IF NOT EXISTS idx_orders_user_id
    ON public.orders (user_id);

-- Busca de pedidos expirados (executada pela função expire_unpaid_orders)
CREATE INDEX IF NOT EXISTS idx_orders_status_expires
    ON public.orders (status, expires_at)
    WHERE status = 'pending';

-- Listagem de lotes por evento
CREATE INDEX IF NOT EXISTS idx_ticket_batches_event_id
    ON public.ticket_batches (event_id);

-- Listagem de eventos por organizador
CREATE INDEX IF NOT EXISTS idx_events_organizer_id
    ON public.events (organizer_id);

-- Listagem de ingressos por pedido
CREATE INDEX IF NOT EXISTS idx_tickets_order_id
    ON public.tickets (order_id);


-- =============================================================================
-- SEÇÃO 6: ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_batches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets         ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SEÇÃO 6.1: POLICIES - PROFILES
-- =============================================================================

-- Usuário lê e atualiza apenas seu próprio perfil
CREATE POLICY "profiles: usuario le proprio perfil"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "profiles: usuario atualiza proprio perfil"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Service role pode inserir (necessário para o trigger handle_new_user)
CREATE POLICY "profiles: service role insere"
    ON public.profiles FOR INSERT
    WITH CHECK (true);


-- =============================================================================
-- SEÇÃO 6.2: POLICIES - ORGANIZERS
-- =============================================================================

-- Qualquer usuário autenticado pode ver a lista de organizadores (nome da empresa, etc.)
CREATE POLICY "organizers: leitura publica para autenticados"
    ON public.organizers FOR SELECT
    TO authenticated
    USING (true);

-- Organizador gerencia apenas seu próprio registro
CREATE POLICY "organizers: organizador insere proprio perfil"
    ON public.organizers FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "organizers: organizador atualiza proprio perfil"
    ON public.organizers FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- =============================================================================
-- SEÇÃO 6.3: POLICIES - EVENTS
-- =============================================================================

-- Qualquer pessoa (inclusive anônimos) pode ver eventos publicados
CREATE POLICY "events: leitura publica de eventos publicados"
    ON public.events FOR SELECT
    USING (status = 'published');

-- Organizador vê todos os seus eventos (inclusive rascunhos)
CREATE POLICY "events: organizador ve seus eventos"
    ON public.events FOR SELECT
    TO authenticated
    USING (
        organizer_id IN (
            SELECT id FROM public.organizers WHERE user_id = auth.uid()
        )
    );

-- Organizador cria eventos apenas sob sua própria organizer_id
CREATE POLICY "events: organizador cria eventos"
    ON public.events FOR INSERT
    TO authenticated
    WITH CHECK (
        organizer_id IN (
            SELECT id FROM public.organizers WHERE user_id = auth.uid()
        )
    );

-- Organizador atualiza apenas seus próprios eventos
CREATE POLICY "events: organizador atualiza seus eventos"
    ON public.events FOR UPDATE
    TO authenticated
    USING (
        organizer_id IN (
            SELECT id FROM public.organizers WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        organizer_id IN (
            SELECT id FROM public.organizers WHERE user_id = auth.uid()
        )
    );


-- =============================================================================
-- SEÇÃO 6.4: POLICIES - TICKET_BATCHES
-- =============================================================================

-- Qualquer pessoa pode ver lotes de eventos publicados
CREATE POLICY "ticket_batches: leitura publica de lotes ativos"
    ON public.ticket_batches FOR SELECT
    USING (
        event_id IN (
            SELECT id FROM public.events WHERE status = 'published'
        )
    );

-- Organizador vê todos os lotes dos seus eventos
CREATE POLICY "ticket_batches: organizador ve seus lotes"
    ON public.ticket_batches FOR SELECT
    TO authenticated
    USING (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    );

-- Organizador cria, atualiza e deleta lotes dos seus eventos
CREATE POLICY "ticket_batches: organizador gerencia seus lotes"
    ON public.ticket_batches FOR ALL
    TO authenticated
    USING (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    )
    WITH CHECK (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    );


-- =============================================================================
-- SEÇÃO 6.5: POLICIES - ORDERS
-- =============================================================================

-- Usuário vê apenas seus próprios pedidos
CREATE POLICY "orders: usuario ve seus pedidos"
    ON public.orders FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- A inserção de pedidos é feita via função RPC (SECURITY DEFINER),
-- então não precisamos de policy de INSERT para o usuário comum.
-- Esta policy permite que a função RPC insira pedidos.
CREATE POLICY "orders: service role gerencia pedidos"
    ON public.orders FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Organizador vê pedidos dos seus eventos (relatórios de vendas)
CREATE POLICY "orders: organizador ve pedidos do seu evento"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    );


-- =============================================================================
-- SEÇÃO 6.6: POLICIES - ORDER_ITEMS
-- =============================================================================

-- Usuário vê itens dos seus próprios pedidos
CREATE POLICY "order_items: usuario ve itens dos seus pedidos"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE user_id = auth.uid()
        )
    );

-- Service role gerencia order_items (usado pelas funções RPC)
CREATE POLICY "order_items: service role gerencia"
    ON public.order_items FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Organizador vê itens dos pedidos dos seus eventos
CREATE POLICY "order_items: organizador ve itens dos seus eventos"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        order_id IN (
            SELECT o.id FROM public.orders o
            JOIN public.events e ON e.id = o.event_id
            JOIN public.organizers org ON org.id = e.organizer_id
            WHERE org.user_id = auth.uid()
        )
    );


-- =============================================================================
-- SEÇÃO 6.7: POLICIES - TICKETS
-- =============================================================================

-- Usuário vê apenas seus próprios ingressos
CREATE POLICY "tickets: usuario ve seus ingressos"
    ON public.tickets FOR SELECT
    TO authenticated
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE user_id = auth.uid()
        )
    );

-- Organizador vê todos os ingressos dos seus eventos (para check-in na portaria)
CREATE POLICY "tickets: organizador ve ingressos do seu evento"
    ON public.tickets FOR SELECT
    TO authenticated
    USING (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    );

-- Organizador pode fazer check-in (UPDATE de status/checked_in_at/checked_in_by)
CREATE POLICY "tickets: organizador faz checkin"
    ON public.tickets FOR UPDATE
    TO authenticated
    USING (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    )
    WITH CHECK (
        event_id IN (
            SELECT e.id FROM public.events e
            JOIN public.organizers o ON o.id = e.organizer_id
            WHERE o.user_id = auth.uid()
        )
    );

-- Service role gerencia tickets (usado pela função confirm_order_payment)
CREATE POLICY "tickets: service role gerencia"
    ON public.tickets FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- =============================================================================
-- SEÇÃO 7: GRANT DE PERMISSÕES PARA FUNÇÕES RPC
-- =============================================================================

-- Permite que usuários autenticados chamem as funções RPC
GRANT EXECUTE ON FUNCTION public.reserve_tickets(UUID, UUID, JSONB)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders()                 TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(UUID, JSONB)    TO service_role;


-- =============================================================================
-- FIM DO SCRIPT
-- =============================================================================
-- Próximos passos:
-- 1. Substitua 'SUA_CHAVE_SECRETA_AQUI' em confirm_order_payment por uma
--    chave forte. Idealmente use: SELECT encode(gen_random_bytes(32), 'hex');
--    para gerar e armazene no Supabase Vault.
-- 2. Configure um cron job para chamar expire_unpaid_orders() periodicamente:
--    - Via pg_cron (extensão do Supabase): SELECT cron.schedule('expire-orders', '* * * * *', 'SELECT public.expire_unpaid_orders()');
--    - Via Edge Function com schedule: https://supabase.com/docs/guides/functions/schedule-functions
-- 3. Configure seu webhook de pagamento para chamar a Edge Function que
--    invoca confirm_order_payment() com a service_role key.
-- =============================================================================
