// DEPRECATED: Supabase client is no longer used.
// This file is kept for compatibility with files that haven't been migrated yet.
// All new code should use @/integrations/api/client instead.

import type { Database } from './types';

// Stub supabase client that throws errors when used
const createStubMethod = (name: string) => {
  return () => {
    throw new Error(
      `Supabase is no longer used. Method "${name}" is not available. ` +
      `Please migrate to use @/integrations/api/client or @/integrations/api/client.ts`
    );
  };
};

// Stub auth methods
const stubAuth = {
  signInWithPassword: createStubMethod('auth.signInWithPassword'),
  signUp: createStubMethod('auth.signUp'),
  signOut: createStubMethod('auth.signOut'),
  resetPasswordForEmail: createStubMethod('auth.resetPasswordForEmail'),
  updateUser: createStubMethod('auth.updateUser'),
  getSession: createStubMethod('auth.getSession'),
  onAuthStateChange: createStubMethod('auth.onAuthStateChange'),
  getUser: createStubMethod('auth.getUser'),
};

// Stub db methods
const createStubTable = () => ({
  select: createStubMethod('from.select'),
  insert: createStubMethod('from.insert'),
  update: createStubMethod('from.update'),
  delete: createStubMethod('from.delete'),
  upsert: createStubMethod('from.upsert'),
  eq: createStubMethod('from.eq'),
  neq: createStubMethod('from.neq'),
  gt: createStubMethod('from.gt'),
  gte: createStubMethod('from.gte'),
  lt: createStubMethod('from.lt'),
  lte: createStubMethod('from.lte'),
  like: createStubMethod('from.like'),
  ilike: createStubMethod('from.ilike'),
  is: createStubMethod('from.is'),
  in: createStubMethod('from.in'),
  contains: createStubMethod('from.contains'),
  containedBy: createStubMethod('from.containedBy'),
  overlaps: createStubMethod('from.overlaps'),
  textSearch: createStubMethod('from.textSearch'),
  match: createStubMethod('from.match'),
  not: createStubMethod('from.not'),
  or: createStubMethod('from.or'),
  and: createStubMethod('from.and'),
  filter: createStubMethod('from.filter'),
  order: createStubMethod('from.order'),
  limit: createStubMethod('from.limit'),
  range: createStubMethod('from.range'),
  single: createStubMethod('from.single'),
  maybeSingle: createStubMethod('from.maybeSingle'),
  csv: createStubMethod('from.csv'),
  then: createStubMethod('from.then'),
});

// Stub storage methods
const stubStorage = {
  from: () => ({
    upload: createStubMethod('storage.upload'),
    download: createStubMethod('storage.download'),
    getPublicUrl: createStubMethod('storage.getPublicUrl'),
    remove: createStubMethod('storage.remove'),
    list: createStubMethod('storage.list'),
  }),
};

// Stub functions methods
const stubFunctions = {
  invoke: createStubMethod('functions.invoke'),
};

// Stub realtime methods
const stubRealtime = {
  channel: createStubMethod('realtime.channel'),
  removeChannel: createStubMethod('realtime.removeChannel'),
  removeAllChannels: createStubMethod('realtime.removeAllChannels'),
};

// Main stub supabase client
export const supabase = {
  auth: stubAuth,
  from: createStubTable,
  storage: stubStorage,
  functions: stubFunctions,
  realtime: stubRealtime,
  rpc: createStubMethod('rpc'),
} as any;

// Also export types for compatibility
export type { Database };
