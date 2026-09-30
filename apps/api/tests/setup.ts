process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://relaydesk:relaydesk@localhost:5432/relaydesk_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.ELASTICSEARCH_URL = 'http://localhost:1'; // ES is intentionally unreachable: the scheduler must not care
process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret';
process.env.MIN_SEND_DELAY_MS = '0';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.BACKEND_URL = 'http://localhost:4000';
