import { describe, expect, it } from 'vitest';
import aPose from './__fixtures__/aPose.json';
import { LANDMARK_NAMES, validatePose } from './poseValidation';
import { fitBodyShapes, hintArrows, regionTones, smoothLandmarks } from './fittedGuide';

const SIZE = { width: aPose.image_width, height: aPose.image_height };
const ASPECT = SIZE.width / SIZE.height;

function landmarks(mutate = () => {}) {
  const named = structuredClone(aPose.landmarks);
  mutate(named);
  return LANDMARK_NAMES.map((name) => named[name]);
}

const byRegion = (shapes, region) => shapes.filter((s) => s.region === region);
const torsoWidth = (shapes) => {
  const xs = byRegion(shapes, 'torso')[0].points.map((p) => p.x);
  return Math.max(...xs) - Math.min(...xs);
};
// The right forearm: the second arm line drawn for the right side.
const forearmEnd = (shapes, side) => {
  const arms = byRegion(shapes, 'arms');
  return (side === 'left' ? arms[1] : arms[4]).b;
};

describe('fitBodyShapes', () => {
  it('builds a torso, head, arms and legs on the detected pose', () => {
    const shapes = fitBodyShapes(landmarks(), SIZE);
    expect(byRegion(shapes, 'torso')).toHaveLength(1);
    expect(byRegion(shapes, 'head').map((s) => s.type)).toEqual(['line', 'ellipse']);
    expect(byRegion(shapes, 'arms')).toHaveLength(6); // upper arm, forearm, hand x2
    expect(byRegion(shapes, 'legs')).toHaveLength(6); // thigh, shin, foot x2
  });

  it('follows the arms as they open', () => {
    const closed = fitBodyShapes(landmarks(), SIZE);
    const open = fitBodyShapes(
      landmarks((n) => {
        n.LEFT_WRIST.x += 0.08;
        n.RIGHT_WRIST.x -= 0.08;
      }),
      SIZE
    );
    const spread = (shapes) => Math.abs(forearmEnd(shapes, 'left').x - forearmEnd(shapes, 'right').x);
    expect(spread(open)).toBeGreaterThan(spread(closed) + 0.15 * SIZE.width);
  });

  it('is as broad as the person: wider shoulders and hips make a wider, thicker outline', () => {
    const regular = fitBodyShapes(landmarks(), SIZE);
    const broad = fitBodyShapes(
      landmarks((n) => {
        for (const [left, right] of [
          ['LEFT_SHOULDER', 'RIGHT_SHOULDER'],
          ['LEFT_HIP', 'RIGHT_HIP'],
        ]) {
          const mid = (n[left].x + n[right].x) / 2;
          n[left].x = mid + (n[left].x - mid) * 1.3;
          n[right].x = mid + (n[right].x - mid) * 1.3;
        }
      }),
      SIZE
    );
    expect(torsoWidth(broad)).toBeGreaterThan(torsoWidth(regular) * 1.2);
    expect(byRegion(broad, 'legs')[0].width).toBeGreaterThan(byRegion(regular, 'legs')[0].width);
  });

  it('draws its outline outside the body, not on the joints', () => {
    const lms = landmarks();
    const shapes = fitBodyShapes(lms, SIZE);
    const shoulderSpan = Math.abs(lms[11].x - lms[12].x) * SIZE.width;
    expect(torsoWidth(shapes)).toBeGreaterThan(shoulderSpan);
  });

  it('leaves out limbs it cannot see, and needs shoulders and hips to draw at all', () => {
    const noWrists = fitBodyShapes(
      landmarks((n) => {
        n.LEFT_WRIST.visibility = 0.1;
      }),
      SIZE
    );
    expect(byRegion(noWrists, 'arms')).toHaveLength(4);
    expect(fitBodyShapes(landmarks((n) => (n.LEFT_HIP.visibility = 0)), SIZE)).toBeNull();
    expect(fitBodyShapes(null, SIZE)).toBeNull();
  });
});

describe('smoothLandmarks', () => {
  it('eases toward the newest detection', () => {
    const from = [{ x: 0, y: 0, visibility: 1 }];
    const to = [{ x: 1, y: 0.5, visibility: 1 }];
    expect(smoothLandmarks(from, to, 0.5)[0]).toMatchObject({ x: 0.5, y: 0.25 });
    expect(smoothLandmarks(null, to, 0.5)[0]).toMatchObject({ x: 1, y: 0.5 });
    expect(smoothLandmarks(from, null, 0.5)).toBe(from);
  });
});

describe('regionTones and hintArrows', () => {
  const armsDown = landmarks((n) => {
    n.LEFT_ELBOW.x = n.LEFT_SHOULDER.x;
    n.LEFT_WRIST.x = n.LEFT_SHOULDER.x;
    n.RIGHT_ELBOW.x = n.RIGHT_SHOULDER.x;
    n.RIGHT_WRIST.x = n.RIGHT_SHOULDER.x;
  });
  const result = validatePose(armsDown, { aspectRatio: ASPECT });

  it('turns the part the instruction is about amber, and everything green once it passes', () => {
    expect(regionTones(result)).toEqual({ head: 'foreground', torso: 'foreground', arms: 'warning', legs: 'foreground' });
    expect(regionTones(validatePose(landmarks(), { aspectRatio: ASPECT }))).toEqual({
      head: 'success',
      torso: 'success',
      arms: 'success',
      legs: 'success',
    });
  });

  it('points the arms outward when they are too close to the body', () => {
    const arrows = hintArrows(result, armsDown, SIZE);
    expect(arrows).toHaveLength(2);
    expect(arrows.map((a) => a.direction.x).sort()).toEqual([-1, 1]);
    expect(hintArrows(validatePose(landmarks(), { aspectRatio: ASPECT }), landmarks(), SIZE)).toEqual([]);
  });
});
