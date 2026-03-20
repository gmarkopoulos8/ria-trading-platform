"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationSchema = exports.SymbolQuerySchema = exports.CreateAlertSchema = exports.ClosePositionSchema = exports.OpenPositionSchema = exports.RegisterSchema = exports.LoginSchema = void 0;
const zod_1 = require("zod");
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
});
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    username: zod_1.z.string().min(3, 'Username must be at least 3 characters').max(32),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    displayName: zod_1.z.string().min(1, 'Display name is required').max(64),
});
exports.OpenPositionSchema = zod_1.z.object({
    symbol: zod_1.z.string().min(1).max(20).toUpperCase(),
    name: zod_1.z.string().max(100).optional().default(''),
    assetClass: zod_1.z.enum(['stock', 'crypto', 'etf']).optional().default('stock'),
    side: zod_1.z.enum(['long', 'short']),
    quantity: zod_1.z.number().positive('Quantity must be positive'),
    entryPrice: zod_1.z.number().positive('Entry price must be positive'),
    targetPrice: zod_1.z.number().positive().optional(),
    stopLoss: zod_1.z.number().positive().optional(),
    thesis: zod_1.z.string().min(1, 'Thesis is required').max(2000),
    thesisHealth: zod_1.z.number().min(0).max(100).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.ClosePositionSchema = zod_1.z.object({
    positionId: zod_1.z.string().uuid(),
    exitPrice: zod_1.z.number().positive('Exit price must be positive'),
    notes: zod_1.z.string().max(500).optional(),
});
exports.CreateAlertSchema = zod_1.z.object({
    symbol: zod_1.z.string().min(1).max(20).toUpperCase(),
    type: zod_1.z.enum(['price', 'volume', 'news', 'technical', 'catalyst']),
    condition: zod_1.z.enum(['above', 'below', 'crosses', 'percent_change']),
    threshold: zod_1.z.number(),
    message: zod_1.z.string().max(500).optional(),
});
exports.SymbolQuerySchema = zod_1.z.object({
    q: zod_1.z.string().min(1, 'Query is required'),
    assetClass: zod_1.z.enum(['stock', 'crypto', 'etf']).optional(),
    limit: zod_1.z.coerce.number().min(1).max(100).default(20),
});
exports.PaginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().min(1).default(1),
    pageSize: zod_1.z.coerce.number().min(1).max(100).default(20),
});
