export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed' | 'pending';

export interface PaperPosition {
  id: string;
  userId: string;
  symbol: string;
  name: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  targetPrice?: number;
  stopLoss?: number;
  pnl: number;
  pnlPercent: number;
  status: PositionStatus;
  thesis: string;
  tags: string[];
  openedAt: Date;
  closedAt?: Date;
  updatedAt: Date;
}

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  cashBalance: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  positions: PaperPosition[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OpenPositionInput {
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  targetPrice?: number;
  stopLoss?: number;
  thesis: string;
  tags?: string[];
}

export interface ClosePositionInput {
  positionId: string;
  exitPrice: number;
  notes?: string;
}
