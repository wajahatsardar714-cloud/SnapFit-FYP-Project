import { describe, expect, it } from 'vitest';
import aPose from './__fixtures__/aPose.json';
import { LANDMARK_NAMES, alignmentState, primaryInstruction, validatePose } from './poseValidation';

// Same synthetic A-pose (768x1024 portrait) the AI service's pytest suite uses.
const ASPECT = aPose.image_width / aPose.image_height;
const GOOD_BRIGHTNESS = 120;

function landmarks(mutate = () => {}) {
  const named = structuredClone(aPose.landmarks);
  mutate(named);
  return LANDMARK_NAMES.map((name) => named[name]);
}

const validate = (lms, options = {}) => validatePose(lms, { aspectRatio: ASPECT, brightness: GOOD_BRIGHTNESS, ...options });
const failedIds = (result) => result.checks.filter((c) => !c.passed && !c.skipped).map((c) => c.id);

function scaleAbout(named, factor, cx = 0.5, cy = 0.52) {
  Object.values(named).forEach((p) => {
    p.x = cx + (p.x - cx) * factor;
    p.y = cy + (p.y - cy) * factor;
  });
}

function frames(count, stepMs, mutateFrame = () => {}) {
  return Array.from({ length: count }, (_, i) => ({ time: i * stepMs, landmarks: landmarks((n) => mutateFrame(n, i)) }));
}

describe('validatePose', () => {
  it('passes a correct A-pose', () => {
    const result = validate(landmarks());
    expect(result.ok).toBe(true);
    expect(result.checks.map((c) => c.id)).toEqual(['lighting', 'visibility', 'framing', 'distance', 'centered', 'facing', 'level', 'pose']);
    expect(alignmentState(result)).toBe('aligned');
    expect(primaryInstruction(result)).toBeNull();
  });

  it('accepts a { NAME: landmark } map as well as the 33-point array', () => {
    expect(validatePose(aPose.landmarks, { aspectRatio: ASPECT }).ok).toBe(true);
  });

  it('reports no body as searching with every check failing', () => {
    const result = validate(null);
    expect(result.ok).toBe(false);
    expect(alignmentState(result)).toBe('searching');
  });

  it('fails cropped feet on visibility and skips the geometric checks', () => {
    const result = validate(
      landmarks((n) => ['LEFT_ANKLE', 'RIGHT_ANKLE', 'LEFT_HEEL', 'RIGHT_HEEL'].forEach((k) => (n[k].visibility = 0.1)))
    );
    expect(failedIds(result)).toEqual(['visibility']);
    expect(primaryInstruction(result)).toBe('Step back so your feet are visible');
    expect(result.checks.slice(2).every((c) => c.skipped)).toBe(true);
    expect(alignmentState(result)).toBe('searching');
  });

  it('fails a side-on pose on facing', () => {
    const result = validate(
      landmarks((n) => {
        Object.assign(n.LEFT_SHOULDER, { x: 0.52, z: -0.15 });
        Object.assign(n.RIGHT_SHOULDER, { x: 0.48, z: 0.15 });
        n.LEFT_HIP.x = 0.51;
        n.RIGHT_HIP.x = 0.49;
      })
    );
    expect(failedIds(result)).toContain('facing');
    expect(alignmentState(result)).toBe('partial');
  });

  it('fails arms down by the sides on pose', () => {
    const result = validate(
      landmarks((n) => {
        ['ELBOW', 'WRIST'].forEach((part) => {
          n[`LEFT_${part}`].x = 0.615;
          n[`RIGHT_${part}`].x = 0.385;
        });
      })
    );
    expect(failedIds(result)).toEqual(['pose']);
    expect(primaryInstruction(result)).toBe('Move your arms slightly away from your body');
  });

  it('fails tilted shoulders on level', () => {
    const result = validate(
      landmarks((n) => {
        n.LEFT_SHOULDER.y = 0.275;
        n.RIGHT_SHOULDER.y = 0.235;
      })
    );
    expect(failedIds(result)).toContain('level');
  });

  it('fails too close and too far on distance', () => {
    const tooClose = validate(landmarks((n) => scaleAbout(n, 1.15)));
    expect(failedIds(tooClose)).toEqual(['distance']);
    expect(primaryInstruction(tooClose)).toBe('Step back a little');

    const tooFar = validate(landmarks((n) => scaleAbout(n, 0.7)));
    expect(failedIds(tooFar)).toEqual(['distance']);
    expect(primaryInstruction(tooFar)).toBe('Move closer to the camera');
  });

  it('fails an off-centre body on centered', () => {
    expect(failedIds(validate(landmarks((n) => Object.values(n).forEach((p) => (p.x += 0.15)))))).toEqual(['centered']);
  });

  it('fails dark and blown-out frames on lighting', () => {
    expect(primaryInstruction(validate(landmarks(), { brightness: 15 }))).toMatch(/too dark/);
    expect(primaryInstruction(validate(landmarks(), { brightness: 250 }))).toMatch(/too bright/);
  });

  it('accepts a mirrored frame', () => {
    expect(validate(landmarks((n) => Object.values(n).forEach((p) => (p.x = 1 - p.x)))).ok).toBe(true);
  });

  describe('stillness', () => {
    it('passes once the body has held still for the whole window', () => {
      const history = frames(8, 150);
      const result = validate(history.at(-1).landmarks, { history });
      expect(result.ok).toBe(true);
      expect(result.checks.at(-1)).toMatchObject({ id: 'stillness', passed: true });
    });

    it('fails until a full window of frames has been seen', () => {
      const history = frames(3, 150);
      expect(failedIds(validate(history.at(-1).landmarks, { history }))).toEqual(['stillness']);
    });

    it('fails a moving sequence', () => {
      const history = frames(8, 150, (n, i) => Object.values(n).forEach((p) => (p.x += i * 0.01)));
      const result = validate(history.at(-1).landmarks, { history });
      expect(failedIds(result)).toEqual(['stillness']);
      expect(primaryInstruction(result)).toBe('Hold still');
    });
  });
});
