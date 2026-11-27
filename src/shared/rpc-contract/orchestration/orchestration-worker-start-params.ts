import { z } from 'zod'
import { OptionalFiniteNumber, OptionalString, requiredString } from '../rpc-param-primitives'
import { CrossStoreParentRefSchema } from '../workspaces/cross-store-parent-params'

export const OptionalWorkerLaunchPreference = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim(), 'Surrounding whitespace is invalid')
  .optional()

export const WorkerStartParams = z
  .object({
    task: OptionalString,
    spec: OptionalString,
    taskTitle: OptionalString,
    deps: OptionalString,
    parent: OptionalString,
    on: OptionalString,
    run: OptionalString,
    from: requiredString('Missing --from'),
    worktree: OptionalString,
    name: OptionalString,
    repo: OptionalString,
    baseBranch: OptionalString,
    displayName: OptionalString,
    comment: OptionalString,
    setup: z.enum(['run', 'skip', 'inherit']).optional(),
    terminal: OptionalString,
    agent: OptionalString,
    /** `--surface`: this start opens as a chat or a terminal instead of the host's setting. */
    surface: z.enum(['chat', 'terminal']).optional(),
    model: OptionalWorkerLaunchPreference,
    effort: OptionalWorkerLaunchPreference,
    retryOf: OptionalString,
    timeoutMs: OptionalFiniteNumber,
    devMode: z.boolean().optional(),
    /** What the creator started this worker for (`bot-item:<uid>`), checked by its owner before the
     *  start and kept on the Dispatch; opaque to orchestration. */
    origin: OptionalString,
    /** The question this worker is started to answer (`--for <message id>`), linked when the caller
     *  took it or reads the mailbox it sits in; otherwise the start goes ahead unlinked. */
    forQuestion: OptionalString,
    /** Only from the paired Orca coordinating this Run: its own ID for the Task this start creates or reopens. */
    adoptTaskId: OptionalString,
    /** Only from the paired Orca coordinating this Run: its own workspace, the parent of a new-child here. */
    crossStoreParent: CrossStoreParentRefSchema.optional(),
    /** Only from the paired Orca coordinating this Run: the start is in a chat lineage there, so it and
     *  the workers it starts start as chats here too. */
    chatLineage: z.literal(true).optional()
  })
  .superRefine((params, ctx) => {
    if (!params.task && !params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['task'],
        message: 'Missing --task or --spec'
      })
    }
    if (params.task && params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spec'],
        message: '--task and --spec are mutually exclusive'
      })
    }
    // A reused terminal is already a terminal; it cannot become a chat or start a second one.
    if (params.surface && params.terminal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['surface'],
        message: '--surface cannot combine with --terminal, which reuses a running terminal agent'
      })
    }
    // spec creates a new Task, so retryOf cannot refer to a prior Dispatch for it.
    if (params.retryOf && params.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['retryOf'],
        message:
          '--retry-of needs --task <task_id> naming the failed Task; --spec creates a new one'
      })
    }
  })
