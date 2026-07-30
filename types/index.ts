import { Database } from './database';

export type Organization = Database['public']['Tables']['organizations']['Row'];
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row'];
export type Client = Database['public']['Tables']['clients']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Quote = Database['public']['Tables']['quotes']['Row'];
export type Contract = Database['public']['Tables']['contracts']['Row'];
export type Milestone = Database['public']['Tables']['milestones']['Row'];
export type CSDCredential = Database['public']['Tables']['csd_credentials']['Row'];
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
