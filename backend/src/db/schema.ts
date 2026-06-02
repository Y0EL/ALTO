import { pgTable, text, boolean, timestamp, bigint, integer, jsonb, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
  })
)

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    durationSec: integer('duration_sec'),
    language: text('language').notNull().default('auto'),
    status: text('status').notNull(),
    geminiFileUri: text('gemini_file_uri'),
    geminiFileName: text('gemini_file_name'),
    transcript: jsonb('transcript').$type<TranscriptPayload | null>(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('jobs_user_idx').on(t.userId),
    createdIdx: index('jobs_created_idx').on(t.createdAt),
  })
)

export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Job = typeof jobs.$inferSelect

export type JobStatus = 'pending' | 'uploading' | 'transcribing' | 'completed' | 'failed'

export interface TranscriptSegment {
  start: string
  end: string
  speaker: string
  text: string
}

export interface TranscriptPayload {
  segments: TranscriptSegment[]
  speakerCount: number
  summary: string
  language: 'id' | 'en' | 'mixed'
}
