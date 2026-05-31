import { describe, expect, it } from 'vitest';
import {
  isProtectedExpressionName,
  isProtectedExpressionTrackName,
  normalizeVrmExpressionKey,
} from './expression-priority';

describe('VRM protected expression priority', () => {
  it('normalizes VRM expression keys', () => {
    expect(normalizeVrmExpressionKey('VRMExpression_AA')).toBe('aa');
    expect(normalizeVrmExpressionKey('blinkLeft')).toBe('blinkleft');
  });

  it('protects mouth, blink, and look expression names', () => {
    expect(isProtectedExpressionName('aa')).toBe(true);
    expect(isProtectedExpressionName('VRMExpression_AA')).toBe(true);
    expect(isProtectedExpressionName('FclMthA')).toBe(true);
    expect(isProtectedExpressionName('blinkLeft')).toBe(true);
    expect(isProtectedExpressionName('lookDown')).toBe(true);
  });

  it('leaves emotion expressions and bone tracks available to animations', () => {
    expect(isProtectedExpressionName('happy')).toBe(false);
    expect(isProtectedExpressionName('relaxed')).toBe(false);
    expect(isProtectedExpressionTrackName('J_Bip_C_Head.quaternion')).toBe(false);
  });

  it('detects protected expression animation tracks without catching normal expressions', () => {
    expect(isProtectedExpressionTrackName('VRMExpression_aa.weight')).toBe(true);
    expect(isProtectedExpressionTrackName('VRMExpression_FclMthA.weight')).toBe(true);
    expect(isProtectedExpressionTrackName('FclMthA.weight')).toBe(true);
    expect(isProtectedExpressionTrackName('expressionManager.presetExpressionMap[aa].weight')).toBe(
      true,
    );
    expect(isProtectedExpressionTrackName('expressionManager.expressionMap[blinkLeft].weight')).toBe(
      true,
    );
    expect(isProtectedExpressionTrackName('expressionManager.expressionMap[lookDown].weight')).toBe(
      true,
    );
    expect(isProtectedExpressionTrackName('expressionManager.expressionMap.happy.weight')).toBe(
      false,
    );
  });
});
