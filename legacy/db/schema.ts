import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const studio = sqliteTable('studio', {id: integer('id').primaryKey(), revision:integer('revision').notNull().default(0), data:text('data').notNull()});
export const scaleReadings = sqliteTable('scale_readings', {
 deviceId: text('device_id').primaryKey().notNull(),
 grossG: real('gross_g').notNull(),
 stable: integer('stable').notNull(),
 recordedAt: text('recorded_at').notNull(),
});

