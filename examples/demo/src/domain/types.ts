export interface Receipt {
  reference: string;
  total: number;
}

export type PaymentState = 'pending' | 'paid' | 'failed';
