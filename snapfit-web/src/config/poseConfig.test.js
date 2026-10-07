import { describe, expect, it } from 'vitest';
import aiRules from '../../../snapfit-ai/app/pose_rules.json';
import { POSE_RULES } from './poseConfig';

// The AI service validates every uploaded photo with the same rules -- if these
// drift, the live camera would accept poses the server then rejects (or the
// reverse). Test-only import: the app itself never reaches into snapfit-ai.
const toCamel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

describe('POSE_RULES', () => {
  it('matches snapfit-ai/app/pose_rules.json', () => {
    const expected = Object.fromEntries(Object.entries(aiRules).map(([key, value]) => [toCamel(key), value]));
    expect(POSE_RULES).toEqual(expected);
  });
});
