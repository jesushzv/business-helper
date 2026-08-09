import { Database } from './database';

export type Organization = Database['public']['Tables']['organizations']['Row'];
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
type QuoteRow = Database['public']['Tables']['quotes']['Row'];

/**
 * Columns that hold the server's OTP state and signer forensics. They exist on
 * the row but must never reach a client: the hash is the signing secret's
 * verifier, and the IP/name are collected as signature evidence. Omitting them
 * from the app-facing type makes leaking one a compile error rather than a
 * judgement call at each call site.
 */
type QuoteServerOnlyFields =
  | 'client_otp_hash'
  | 'client_otp_expires_at'
  | 'client_otp_attempts'
  | 'client_otp_sent_at'
  | 'client_otp_verified'
  | 'accepted_by_name'
  | 'accepted_ip';

/** Populated only once a quote has been signed. */
type QuoteSignatureFields = 'contract_hash' | 'accepted_at';

export type Quote = Omit<QuoteRow, QuoteServerOnlyFields | QuoteSignatureFields> &
  Partial<Pick<QuoteRow, QuoteSignatureFields>>;
export type Contract = Database['public']['Tables']['contracts']['Row'];
export type Milestone = Database['public']['Tables']['milestones']['Row'];
export type PacConnection = Database['public']['Tables']['pac_connections']['Row'];
export type CfdiPaymentComplement =
  Database['public']['Tables']['cfdi_payment_complements']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  sat_code?: string;
  unit?: string;
}

export interface TaxBreakdown {
  subtotal: number;
  ivaAmount: number;
  retencionIsrAmount: number;
  retencionIvaAmount: number;
  totalAmount: number;
}

export interface RFCValidationResult {
  isValid: boolean;
  type: 'moral' | 'fisica' | null;
  rfc?: string;
  error?: string;
}

export interface AccountsReceivableSummary {
  totalOverdue: number;
  totalDueToday: number;
  totalUpcoming: number;
  overdueCount: number;
}

export interface ClientCreditSummary {
  /**
   * Whether a credit line has ever been configured for this client.
   *
   * `clients.credit_limit` is nullable and has no default, so "never assessed"
   * and "assessed at zero" are different facts. Collapsing them let the detail
   * page show every real client an authorized limit of $0 with a confident
   * green "Activo" badge — a decision the owner never made (#96).
   */
  isConfigured: boolean;
  /**
   * Whether a spending limit specifically is on file. Narrower than
   * `isConfigured`, which is also true for a status-only decision (a client
   * blocked before any line was assigned). Utilization, available credit and
   * the progress bar are only meaningful when this is true.
   */
  hasLimit: boolean;
  totalLimit: number;
  usedCredit: number;
  availableCredit: number;
  /** null when no terms are configured; 0 is a real answer meaning contado. */
  creditDays: number | null;
  /** null when no credit line is configured — never defaulted to 'active'. */
  status: 'active' | 'suspended' | 'blocked' | null;
  isOverLimit: boolean;
  utilizationPercentage: number;
}

