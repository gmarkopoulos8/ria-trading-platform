export type AlertType = 'price' | 'volume' | 'news' | 'technical' | 'catalyst';
export type AlertStatus = 'active' | 'triggered' | 'dismissed';
export type AlertCondition = 'above' | 'below' | 'crosses' | 'percent_change';

export interface Alert {
  id: string;
  userId: string;
  symbol: string;
  type: AlertType;
  condition: AlertCondition;
  threshold: number;
  message: string;
  status: AlertStatus;
  triggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAlertInput {
  symbol: string;
  type: AlertType;
  condition: AlertCondition;
  threshold: number;
  message?: string;
}
