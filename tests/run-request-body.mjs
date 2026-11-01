import { runTsSuite } from './run-ts-suite.mjs';
await runTsSuite('request-body', ['app/request-body.ts', 'tests/request-body.test.ts'], 'tests/request-body.test.ts');
