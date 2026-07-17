/**
 * Barrel export cho shared setup layer.
 * Dùng trong spec/helper:
 *   import { createAuthSession, createRecord, cleanupRegistry, SetupFailure } from '../../support/setup';
 */
export * from './contracts/preconditionTypes';
export * from './cleanup/cleanupRegistry';
export * from './hooks/testHookClient';
export * from './fixtures/fixtureRegistry';
export * from './mocks/externalDependencyMock';
export * from './factories/authFactory';
export * from './factories/userFactory';
export * from './factories/domainFactory';
export * from './db/uatPgClient';
