import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    worker: 'src/worker.ts',
    'reactors/prometheus': 'src/reactors/prometheus.ts',
    'reactors/sentry': 'src/reactors/sentry.ts',
    'reactors/otel': 'src/reactors/otel.ts',
    'reactors/pino': 'src/reactors/pino.ts',
    'integrations/express': 'src/integrations/express.ts',
    'integrations/fastify': 'src/integrations/fastify.ts',
    'integrations/nestjs': 'src/integrations/nestjs.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  target: 'node18',
  external: ['prom-client', '@sentry/node', '@opentelemetry/api', 'pino'],
});
