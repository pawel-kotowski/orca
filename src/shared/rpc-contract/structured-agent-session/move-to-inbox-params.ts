import { z } from 'zod'

export const MoveToInboxParams = z
  .object({ sessionId: z.string().min(1), message: z.string().min(1) })
  .strict()
