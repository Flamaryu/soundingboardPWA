import { pgTable, text, serial, integer, timestamp, doublePrecision, customType, boolean, unique } from 'drizzle-orm/pg-core'
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
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role', { enum: ['citizen', 'business'] }).notNull().default('citizen'),
  address: text('address'),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  neighborhoodId: integer('neighborhood_id').references(() => neighborhoods.id),
})

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(), // Stories, Mini-blogs, Event text
  type: text('type', { enum: ['story', 'miniblog', 'short'] }).notNull(),
  mediaUrl: text('media_url'), // S3, CDN, YouTube, image links
  userType: text('user_type', { enum: ['citizen', 'business'] }).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  neighborhoodId: integer('neighborhood_id').references(() => neighborhoods.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  isProposal: boolean('is_proposal').default(false).notNull(),
  likes: integer('likes').default(0).notNull(),
  seconds: integer('seconds').default(0).notNull(),
  dislikes: integer('dislikes').default(0).notNull(),
  objections: integer('objections').default(0).notNull(),
  location: geographyPoint('location'), // geographyPoint for ST_DWithin queries
})

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
  neighborhood: one(neighborhoods, { fields: [users.neighborhoodId], references: [neighborhoods.id] }),
  posts: many(posts),
  reactions: many(postReactions),
}))

export const postsRelations = relations(posts, ({ one, many }) => ({
  user: one(users, { fields: [posts.userId], references: [users.id] }),
  neighborhood: one(neighborhoods, { fields: [posts.neighborhoodId], references: [neighborhoods.id] }),
  reactions: many(postReactions),
}))

export const postReactions = pgTable('post_reactions', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  type: text('type', { enum: ['like', 'second', 'dislike', 'object'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  unique('post_user_unique').on(table.postId, table.userId)
])

export const postReactionsRelations = relations(postReactions, ({ one }) => ({
  post: one(posts, { fields: [postReactions.postId], references: [posts.id] }),
  user: one(users, { fields: [postReactions.userId], references: [users.id] }),
}))
