import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount rendered trees between tests (automatic only with Vitest globals on).
afterEach(cleanup);

// Pages load lazily; under a full parallel run the first render of one can
// take longer than the default 1s that findBy* queries wait.
configure({ asyncUtilTimeout: 3000 });
