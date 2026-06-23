import { z } from 'zod';

export const scheduleItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  maker: z.string(),
  categoryId: z.string(),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  // Unresolved short-code from a Google import that matched multiple products —
  // shown in the editor so the worker picks the right one. Form-only (not stored).
  rawCode: z.string().optional(),
});

export const scheduleSchema = z.object({
  title: z.string(),
  carType: z.string(),
  description: z.string().optional(),
  startAt: z.string(),
  endAt: z.string(),
  customerId: z.string(),
  customerName: z.string(),
  staffId: z.string(),
  staffName: z.string(),
  customer: z.string(),
  requester: z.string(),
  showComiPack: z.boolean().optional(),
  items: z.array(scheduleItemSchema),
});

export type ScheduleFormData = z.infer<typeof scheduleSchema>;
