import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(32),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1, 'Display name is required').max(64),
});

export const OpenPositionSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  side: z.enum(['long', 'short']),
  quantity: z.number().positive('Quantity must be positive'),
  entryPrice: z.number().positive('Entry price must be positive'),
  targetPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  thesis: z.string().min(1, 'Thesis is required').max(1000),
  tags: z.array(z.string()).optional(),
});

export const ClosePositionSchema = z.object({
  positionId: z.string().uuid(),
  exitPrice: z.number().positive('Exit price must be positive'),
  notes: z.string().max(500).optional(),
});

export const CreateAlertSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  type: z.enum(['price', 'volume', 'news', 'technical', 'catalyst']),
  condition: z.enum(['above', 'below', 'crosses', 'percent_change']),
  threshold: z.number(),
  message: z.string().max(500).optional(),
});

export const SymbolQuerySchema = z.object({
  q: z.string().min(1, 'Query is required'),
  assetClass: z.enum(['stock', 'crypto', 'etf']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type OpenPositionInput = z.infer<typeof OpenPositionSchema>;
export type ClosePositionInput = z.infer<typeof ClosePositionSchema>;
export type CreateAlertInput = z.infer<typeof CreateAlertSchema>;
export type SymbolQueryInput = z.infer<typeof SymbolQuerySchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
