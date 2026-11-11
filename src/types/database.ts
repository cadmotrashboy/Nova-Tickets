export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileRole = 'buyer' | 'organizer' | 'admin';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'finished';
export type BatchStatus = 'active' | 'paused' | 'sold_out' | 'closed';
export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded';
export type TicketStatus = 'valid' | 'used' | 'cancelled';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          cpf: string | null;
          phone: string | null;
          email: string;
          role: ProfileRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          cpf?: string | null;
          phone?: string | null;
          email: string;
          role?: ProfileRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          cpf?: string | null;
          phone?: string | null;
          email?: string;
          role?: ProfileRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizers: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          document: string;
          wallet_id: string | null;
          pix_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          document: string;
          wallet_id?: string | null;
          pix_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          document?: string;
          wallet_id?: string | null;
          pix_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          organizer_id: string;
          title: string;
          slug: string;
          description: string | null;
          banner_url: string | null;
          location_name: string | null;
          address: string | null;
          start_date: string;
          end_date: string;
          status: EventStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organizer_id: string;
          title: string;
          slug: string;
          description?: string | null;
          banner_url?: string | null;
          location_name?: string | null;
          address?: string | null;
          start_date: string;
          end_date: string;
          status?: EventStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organizer_id?: string;
          title?: string;
          slug?: string;
          description?: string | null;
          banner_url?: string | null;
          location_name?: string | null;
          address?: string | null;
          start_date?: string;
          end_date?: string;
          status?: EventStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ticket_batches: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          price: number;
          fee_percentage: number;
          total_quantity: number;
          available_quantity: number;
          sales_start: string;
          sales_end: string;
          status: BatchStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          price: number;
          fee_percentage?: number;
          total_quantity: number;
          available_quantity: number;
          sales_start: string;
          sales_end: string;
          status?: BatchStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          name?: string;
          price?: number;
          fee_percentage?: number;
          total_quantity?: number;
          available_quantity?: number;
          sales_start?: string;
          sales_end?: string;
          status?: BatchStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          event_id: string;
          total_amount: number;
          platform_fee_amount: number;
          organizer_amount: number;
          status: OrderStatus;
          payment_gateway_id: string | null;
          pix_qr_code: string | null;
          pix_copy_paste: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_id: string;
          total_amount: number;
          platform_fee_amount?: number;
          organizer_amount?: number;
          status?: OrderStatus;
          payment_gateway_id?: string | null;
          pix_qr_code?: string | null;
          pix_copy_paste?: string | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          event_id?: string;
          total_amount?: number;
          platform_fee_amount?: number;
          organizer_amount?: number;
          status?: OrderStatus;
          payment_gateway_id?: string | null;
          pix_qr_code?: string | null;
          pix_copy_paste?: string | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          batch_id: string;
          quantity: number;
          unit_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          batch_id: string;
          quantity: number;
          unit_price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          batch_id?: string;
          quantity?: number;
          unit_price?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          order_id: string;
          event_id: string;
          batch_id: string;
          owner_name: string;
          owner_cpf: string;
          owner_email: string;
          qr_code_hash: string;
          status: TicketStatus;
          checked_in_at: string | null;
          checked_in_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          event_id: string;
          batch_id: string;
          owner_name: string;
          owner_cpf: string;
          owner_email: string;
          qr_code_hash: string;
          status?: TicketStatus;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          event_id?: string;
          batch_id?: string;
          owner_name?: string;
          owner_cpf?: string;
          owner_email?: string;
          qr_code_hash?: string;
          status?: TicketStatus;
          checked_in_at?: string | null;
          checked_in_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      reserve_tickets: {
        Args: {
          p_user_id: string;
          p_event_id: string;
          p_items: Json;
        };
        Returns: string;
      };
      expire_unpaid_orders: {
        Args: Record<string, never>;
        Returns: number;
      };
      confirm_order_payment: {
        Args: {
          p_order_id: string;
          p_attendees: Json;
        };
        Returns: boolean;
      };
    };
    Enums: {
      profile_role: ProfileRole;
      event_status: EventStatus;
      batch_status: BatchStatus;
      order_status: OrderStatus;
      ticket_status: TicketStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

// Convenience entity types
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Organizer = Database['public']['Tables']['organizers']['Row'];
export type Event = Database['public']['Tables']['events']['Row'];
export type TicketBatch = Database['public']['Tables']['ticket_batches']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Ticket = Database['public']['Tables']['tickets']['Row'];

export interface ReserveItemPayload {
  batch_id: string;
  quantity: number;
}

export interface AttendeePayload {
  batch_id: string;
  attendees: {
    name: string;
    cpf: string;
    email: string;
  }[];
}
