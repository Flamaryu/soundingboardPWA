import { pgTable, text, serial, integer, timestamp, doublePrecision, customType, boolean, unique, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Custom PostGIS MultiPolygon Type
export const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(MultiPolygon, 4326)'
  },
  toDriver(value: string) {
    return value
  },
  fromDriver(value: string) {
    return value
  }
})

// Custom PostGIS Point Type
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)'
  },
  toDriver(value: string) {
    return value
  },
  fromDriver(value: string) {
    return value
  }
})

export const states = pgTable('states', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
})

export const cities = pgTable('cities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  stateId: integer('state_id').references(() => states.id).notNull(),
})

export const councilDistricts = pgTable('council_districts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  boundary: geometry('boundary'), // stores spatial MultiPolygon coordinates
})

export const historicDistricts = pgTable('historic_districts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  boundary: geometry('boundary'), // stores spatial MultiPolygon coordinates
})

export const planningDistricts = pgTable('planning_districts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  cityId: integer('city_id').references(() => cities.id).notNull(),
})

export const neighborhoods = pgTable('neighborhoods', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  districtId: integer('district_id').references(() => planningDistricts.id).notNull(),
  boundary: geometry('boundary'), // stores spatial MultiPolygon coordinates
})

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  system_username: text('system_username').notNull().unique(),
  display_name: text('display_name'),
  home_neighborhood: text('home_neighborhood'),
  neighborhood_id: integer('neighborhood_id'), // Keeps snake_case database property alignment
  role: text('role').default('citizen').notNull(),
});

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  author_id: text('author_id').references(() => users.id, { onDelete: 'cascade' }),
  guest_name: text('guest_name'),
  neighborhood_id: integer('neighborhood_id').references(() => neighborhoods.id, { onDelete: 'set null' }),
  
  // Expanded Content Fields
  title: text('title'),
  content: text('content').notNull(),
  type: text('type').default('miniblog').notNull(), // e.g., 'miniblog', 'story', 'short'
  media_url: text('media_url'),
  is_proposal: boolean('is_proposal').default(false).notNull(),
  
  // Echo Algorithm Engine Metrics
  walking_likes: integer('walking_likes').default(0).notNull(),
  civic_votes: integer('civic_votes').default(0).notNull(),
  debate_heat: integer('debate_heat').default(0).notNull(),
  ripples: integer('ripples').default(0).notNull(),
  toxicity_flags: integer('toxicity_flags').default(0).notNull(),
  
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Drizzle relations
export const statesRelations = relations(states, ({ many }) => ({
  cities: many(cities),
}))

export const citiesRelations = relations(cities, ({ one, many }) => ({
  state: one(states, { fields: [cities.stateId], references: [states.id] }),
  planningDistricts: many(planningDistricts),
}))

export const planningDistrictsRelations = relations(planningDistricts, ({ one, many }) => ({
  city: one(cities, { fields: [planningDistricts.cityId], references: [cities.id] }),
  neighborhoods: many(neighborhoods),
}))

export const neighborhoodsRelations = relations(neighborhoods, ({ one, many }) => ({
  planningDistrict: one(planningDistricts, { fields: [neighborhoods.districtId], references: [planningDistricts.id] }),
  users: many(users),
  posts: many(posts),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  neighborhood: one(neighborhoods, { fields: [users.neighborhood_id], references: [neighborhoods.id] }),
  posts: many(posts),
  reactions: many(postReactions),
}))

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.author_id], references: [users.id] }),
  neighborhood: one(neighborhoods, { fields: [posts.neighborhood_id], references: [neighborhoods.id] }),
  reactions: many(postReactions),
}))

export const councilDistrictsRelations = relations(councilDistricts, ({ many }) => ({
  posts: many(posts),
}))

export const historicDistrictsRelations = relations(historicDistricts, ({ many }) => ({
  posts: many(posts),
}))

export const postReactions = pgTable('post_reactions', {
  id: text('id').primaryKey(),
  post_id: text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  user_id: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  guest_id: text('guest_id'),
  reaction_type: text('reaction_type').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique('post_user_reaction_unique').on(table.post_id, table.user_id),
  unique('post_guest_reaction_unique').on(table.post_id, table.guest_id)
])

export const postReactionsRelations = relations(postReactions, ({ one }) => ({
  post: one(posts, { fields: [postReactions.post_id], references: [posts.id] }),
  user: one(users, { fields: [postReactions.user_id], references: [users.id] }),
}))

export const civicVotes = pgTable('civic_votes', {
  id: serial('id').primaryKey(),
  postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  vote: text('vote', { enum: ['agree', 'object'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  interactionWeight: doublePrecision('interaction_weight').default(1.0).notNull(),
}, (table) => [
  unique('civic_vote_user_unique').on(table.postId, table.userId)
])

export const civicVotesRelations = relations(civicVotes, ({ one }) => ({
  post: one(posts, { fields: [civicVotes.postId], references: [posts.id] }),
  user: one(users, { fields: [civicVotes.userId], references: [users.id] }),
}))

export const betaFeedback = pgTable('beta_feedback', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const commercialVerificationRequests = pgTable('commercial_verification_requests', {
  id: serial('id').primaryKey(),
  userId: text('user_id'),
  organizationName: text('organization_name').notNull(),
  organizationType: text('organization_type', { enum: ['business', 'nonprofit', 'political'] }).notNull(),
  contactEmail: text('contact_email').notNull(),
  details: text('details'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

