import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount rendered trees between tests (automatic only with Vitest globals on).
afterEach(cleanup);
