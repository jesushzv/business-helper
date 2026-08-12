export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          rfc: string | null;
          regimen_fiscal: string | null;
          codigo_postal: string | null;
          logo_url: string | null;
          phone: string | null;
          industry: string | null;
          owner_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          subscription_tier: 'free' | 'inicial' | 'emprendedor' | 'negocio' | 'empresa';
          subscription_status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
          facturapi_organization_id: string | null;
          bank_name: string | null;
          bank_clabe: string | null;
          bank_account_holder: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          rfc?: string | null;
          regimen_fiscal?: string | null;
          codigo_postal?: string | null;
          logo_url?: string | null;
          phone?: string | null;
          industry?: string | null;
          owner_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_tier?: 'free' | 'inicial' | 'emprendedor' | 'negocio' | 'empresa';
          subscription_status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
          facturapi_organization_id?: string | null;
          bank_name?: string | null;
          bank_clabe?: string | null;
          bank_account_holder?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          rfc?: string | null;
          regimen_fiscal?: string | null;
          codigo_postal?: string | null;
          logo_url?: string | null;
          phone?: string | null;
          industry?: string | null;
          owner_id?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          subscription_tier?: 'free' | 'inicial' | 'emprendedor' | 'negocio' | 'empresa';
          subscription_status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired';
          facturapi_organization_id?: string | null;
          bank_name?: string | null;
          bank_clabe?: string | null;
          bank_account_holder?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: 'owner' | 'manager' | 'member' | 'accountant';
          invited_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: 'owner' | 'manager' | 'member' | 'accountant';
          invited_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: 'owner' | 'manager' | 'member' | 'accountant';
          invited_at?: string;
          created_at?: string;
        };
      };
      organization_invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: 'manager' | 'member' | 'accountant';
          token_hash: string;
          status: 'pending' | 'accepted' | 'revoked';
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: 'manager' | 'member' | 'accountant';
          token_hash: string;
          status?: 'pending' | 'accepted' | 'revoked';
          invited_by?: string | null;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: 'manager' | 'member' | 'accountant';
          token_hash?: string;
          status?: 'pending' | 'accepted' | 'revoked';
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          rfc: string | null;
          regimen_fiscal: string | null;
          codigo_postal: string | null;
          cfdi_use: string | null;
          notes: string | null;
          health_score: number;
          credit_limit: number | null;
          credit_days: number | null;
          credit_status: 'active' | 'suspended' | 'blocked' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          rfc?: string | null;
          regimen_fiscal?: string | null;
          codigo_postal?: string | null;
          cfdi_use?: string | null;
          notes?: string | null;
          health_score?: number;
          credit_limit?: number | null;
          credit_days?: number | null;
          credit_status?: 'active' | 'suspended' | 'blocked' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          rfc?: string | null;
          regimen_fiscal?: string | null;
          codigo_postal?: string | null;
          cfdi_use?: string | null;
          notes?: string | null;
          health_score?: number;
          credit_limit?: number | null;
          credit_days?: number | null;
          credit_status?: 'active' | 'suspended' | 'blocked' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          unit_price: number;
          unit: string;
          sat_product_code: string;
          stock_quantity: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          unit_price: number;
          unit?: string;
          sat_product_code?: string;
          stock_quantity?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          unit_price?: number;
          unit?: string;
          sat_product_code?: string;
          stock_quantity?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      bank_accounts: {
        Row: {
          id: string;
          organization_id: string;
          /** What the owner calls it — two 18-digit strings are indistinguishable by sight. */
          label: string;
          bank_name: string;
          clabe: string;
          account_holder: string | null;
          is_default: boolean;
          /** Archived accounts keep resolving for the quotes that named them, but receive no new money. */
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          label: string;
          bank_name: string;
          clabe: string;
          account_holder?: string | null;
          is_default?: boolean;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          label?: string;
          bank_name?: string;
          clabe?: string;
          account_holder?: string | null;
          is_default?: boolean;
          archived_at?: string | null;
          updated_at?: string;
        };
      };
      quotes: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          created_by: string;
          title: string;
          line_items: Json;
          subtotal_amount: number;
          iva_amount: number;
          retencion_isr_amount: number;
          retencion_iva_amount: number;
          total_amount: number;
          currency: 'MXN' | 'USD';
          status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
          valid_until: string | null;
          notes: string | null;
          public_token: string;
          client_otp_hash: string | null;
          client_otp_expires_at: string | null;
          client_otp_attempts: number;
          client_otp_sent_at: string | null;
          client_otp_verified: boolean;
          contract_hash: string | null;
          accepted_at: string | null;
          accepted_by_name: string | null;
          accepted_ip: string | null;
          converted_contract_id: string | null;
          /** Which settlement account this quote's client pays into; NULL = the org default (#164). */
          bank_account_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          created_by: string;
          title: string;
          line_items?: Json;
          subtotal_amount: number;
          iva_amount?: number;
          retencion_isr_amount?: number;
          retencion_iva_amount?: number;
          total_amount: number;
          currency?: 'MXN' | 'USD';
          status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
          valid_until?: string | null;
          notes?: string | null;
          public_token?: string;
          client_otp_hash?: string | null;
          client_otp_expires_at?: string | null;
          client_otp_attempts?: number;
          client_otp_sent_at?: string | null;
          client_otp_verified?: boolean;
          contract_hash?: string | null;
          accepted_at?: string | null;
          accepted_by_name?: string | null;
          accepted_ip?: string | null;
          converted_contract_id?: string | null;
          bank_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          created_by?: string;
          title?: string;
          line_items?: Json;
          subtotal_amount?: number;
          iva_amount?: number;
          retencion_isr_amount?: number;
          retencion_iva_amount?: number;
          total_amount?: number;
          currency?: 'MXN' | 'USD';
          status?: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
          valid_until?: string | null;
          notes?: string | null;
          public_token?: string;
          client_otp_hash?: string | null;
          client_otp_expires_at?: string | null;
          client_otp_attempts?: number;
          client_otp_sent_at?: string | null;
          client_otp_verified?: boolean;
          contract_hash?: string | null;
          accepted_at?: string | null;
          accepted_by_name?: string | null;
          accepted_ip?: string | null;
          converted_contract_id?: string | null;
          bank_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      contracts: {
        Row: {
          id: string;
          organization_id: string;
          quote_id: string | null;
          client_id: string;
          title: string;
          scope_description: string;
          total_amount: number;
          currency: 'MXN' | 'USD';
          status: 'draft' | 'sent' | 'client_signed' | 'accepted' | 'completed' | 'cancelled';
          contract_hash: string | null;
          client_otp_hash: string | null;
          client_otp_expires_at: string | null;
          client_otp_sent_at: string | null;
          client_otp_verified: boolean;
          client_otp_attempts: number;
          accepted_at: string | null;
          accepted_by_name: string | null;
          accepted_ip: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          quote_id?: string | null;
          client_id: string;
          title: string;
          scope_description: string;
          total_amount: number;
          currency?: 'MXN' | 'USD';
          status?: 'draft' | 'sent' | 'client_signed' | 'accepted' | 'completed' | 'cancelled';
          contract_hash?: string | null;
          client_otp_hash?: string | null;
          client_otp_expires_at?: string | null;
          client_otp_sent_at?: string | null;
          client_otp_verified?: boolean;
          client_otp_attempts?: number;
          accepted_at?: string | null;
          accepted_by_name?: string | null;
          accepted_ip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          quote_id?: string | null;
          client_id?: string;
          title?: string;
          scope_description?: string;
          total_amount?: number;
          currency?: 'MXN' | 'USD';
          status?: 'draft' | 'sent' | 'client_signed' | 'accepted' | 'completed' | 'cancelled';
          contract_hash?: string | null;
          client_otp_hash?: string | null;
          client_otp_expires_at?: string | null;
          client_otp_sent_at?: string | null;
          client_otp_verified?: boolean;
          client_otp_attempts?: number;
          accepted_at?: string | null;
          accepted_by_name?: string | null;
          accepted_ip?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      milestones: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string;
          label: string;
          amount: number;
          due_date: string;
          status: 'pending' | 'requested' | 'marked_paid' | 'confirmed';
          receipt_url: string | null;
          tracking_reference: string | null;
          transferred_amount: number | null;
          cfdi_id: string | null;
          cfdi_status: 'none' | 'pending' | 'issued' | 'failed' | 'cancelled';
          cfdi_uuid: string | null;
          cfdi_provider: string | null;
          cfdi_environment: 'sandbox' | 'live' | null;
          cfdi_xml_path: string | null;
          cfdi_pdf_path: string | null;
          cfdi_stamped_at: string | null;
          cfdi_cancelled_at: string | null;
          cfdi_error: string | null;
          cfdi_xml_url: string | null;
          cfdi_pdf_url: string | null;
          cfdi_payment_method: 'PUE' | 'PPD' | null;
          cfdi_total: number | null;
          confirmed_at: string | null;
          created_at: string;
          /** 1..n for conversion-created rows; null for manual cobros (#222). */
          conversion_position: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id: string;
          label: string;
          amount: number;
          due_date: string;
          conversion_position?: number | null;
          status?: 'pending' | 'requested' | 'marked_paid' | 'confirmed';
          receipt_url?: string | null;
          tracking_reference?: string | null;
          transferred_amount?: number | null;
          cfdi_id?: string | null;
          cfdi_status?: 'none' | 'pending' | 'issued' | 'failed' | 'cancelled';
          cfdi_uuid?: string | null;
          cfdi_provider?: string | null;
          cfdi_environment?: 'sandbox' | 'live' | null;
          cfdi_xml_path?: string | null;
          cfdi_pdf_path?: string | null;
          cfdi_stamped_at?: string | null;
          cfdi_cancelled_at?: string | null;
          cfdi_error?: string | null;
          cfdi_xml_url?: string | null;
          cfdi_pdf_url?: string | null;
          cfdi_payment_method?: 'PUE' | 'PPD' | null;
          cfdi_total?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string;
          label?: string;
          amount?: number;
          due_date?: string;
          status?: 'pending' | 'requested' | 'marked_paid' | 'confirmed';
          receipt_url?: string | null;
          tracking_reference?: string | null;
          transferred_amount?: number | null;
          cfdi_id?: string | null;
          cfdi_status?: 'none' | 'pending' | 'issued' | 'failed' | 'cancelled';
          cfdi_uuid?: string | null;
          cfdi_provider?: string | null;
          cfdi_environment?: 'sandbox' | 'live' | null;
          cfdi_xml_path?: string | null;
          cfdi_pdf_path?: string | null;
          cfdi_stamped_at?: string | null;
          cfdi_cancelled_at?: string | null;
          cfdi_error?: string | null;
          cfdi_xml_url?: string | null;
          cfdi_pdf_url?: string | null;
          cfdi_payment_method?: 'PUE' | 'PPD' | null;
          cfdi_total?: number | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
      };
      // A milestone models one CFDI. A PPD invoice paid in three transfers owes
      // three complementos de pago, each a stamped document with its own folio
      // fiscal, so they live in their own table.
      // See 20260807170000_cfdi_payment_complements.sql.
      cfdi_payment_complements: {
        Row: {
          id: string;
          organization_id: string;
          milestone_id: string;
          installment: number;
          amount: number;
          last_balance: number;
          remaining_balance: number;
          /** What the payment exceeded the balance by (#81); NULL predates the column. */
          overpaid_amount: number | null;
          payment_form: string;
          payment_date: string;
          operation_number: string | null;
          status: 'pending' | 'issued' | 'failed' | 'cancelled';
          cfdi_id: string | null;
          cfdi_uuid: string | null;
          cfdi_provider: string | null;
          cfdi_environment: 'sandbox' | 'live' | null;
          cfdi_xml_path: string | null;
          cfdi_pdf_path: string | null;
          stamped_at: string | null;
          cancelled_at: string | null;
          error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          milestone_id: string;
          installment: number;
          amount: number;
          last_balance: number;
          remaining_balance: number;
          overpaid_amount?: number | null;
          payment_form?: string;
          payment_date?: string;
          operation_number?: string | null;
          status?: 'pending' | 'issued' | 'failed' | 'cancelled';
          cfdi_id?: string | null;
          cfdi_uuid?: string | null;
          cfdi_provider?: string | null;
          cfdi_environment?: 'sandbox' | 'live' | null;
          cfdi_xml_path?: string | null;
          cfdi_pdf_path?: string | null;
          stamped_at?: string | null;
          cancelled_at?: string | null;
          error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          milestone_id?: string;
          installment?: number;
          amount?: number;
          last_balance?: number;
          remaining_balance?: number;
          overpaid_amount?: number | null;
          payment_form?: string;
          payment_date?: string;
          operation_number?: string | null;
          status?: 'pending' | 'issued' | 'failed' | 'cancelled';
          cfdi_id?: string | null;
          cfdi_uuid?: string | null;
          cfdi_provider?: string | null;
          cfdi_environment?: 'sandbox' | 'live' | null;
          cfdi_xml_path?: string | null;
          cfdi_pdf_path?: string | null;
          stamped_at?: string | null;
          cancelled_at?: string | null;
          error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      // csd_credentials was dropped in 20260807120000_cfdi_pac_integration.sql.
      // Business Helper never holds a user's CSD; see the migration and
      // docs/02-architecture/cfdi_integration_architecture.md §02.
      pac_connections: {
        Row: {
          id: string;
          organization_id: string;
          provider: 'facturapi';
          api_key_sealed: string;
          api_key_hint: string;
          environment: 'sandbox' | 'live';
          connected_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider?: 'facturapi';
          api_key_sealed: string;
          api_key_hint: string;
          environment?: 'sandbox' | 'live';
          connected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: 'facturapi';
          api_key_sealed?: string;
          api_key_hint?: string;
          environment?: 'sandbox' | 'live';
          connected_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          contract_id: string | null;
          action: string;
          actor: string;
          details: string;
          ip: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contract_id?: string | null;
          action: string;
          actor: string;
          details: string;
          ip?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contract_id?: string | null;
          action?: string;
          actor?: string;
          details?: string;
          ip?: string | null;
          created_at?: string;
        };
      };
      stripe_webhook_events: {
        Row: {
          id: string;
          event_type: string;
          organization_id: string | null;
          payload: Json | null;
          processed_at: string;
        };
        Insert: {
          id: string;
          event_type: string;
          organization_id?: string | null;
          payload?: Json | null;
          processed_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          organization_id?: string | null;
          payload?: Json | null;
          processed_at?: string;
        };
      };
      ai_usage_monthly: {
        Row: {
          organization_id: string;
          month: string;
          used: number;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          month: string;
          used?: number;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          month?: string;
          used?: number;
          updated_at?: string;
        };
      };
      otp_send_log: {
        Row: {
          id: string;
          phone_e164: string;
          quote_id: string | null;
          channel: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          phone_e164: string;
          quote_id?: string | null;
          channel?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          phone_e164?: string;
          quote_id?: string | null;
          channel?: string | null;
          created_at?: string;
        };
      };
    };
    // These tables are hand-written rather than generated, and omit the
    // `Relationships` key supabase-js needs to resolve a schema, which is why
    // callers throughout the app cast the client. The folio RPCs that used to
    // be declared here were dropped live by 20260812182430 (#224) — a typed
    // RPC the catalog does not have compiles clean and 404s at runtime (#96).
    Functions: Record<string, never>;
  };
}
