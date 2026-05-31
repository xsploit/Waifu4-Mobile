const PROTECTED_EXPRESSION_ALIASES: Record<string, string> = {
  a: 'aa',
  blinkl: 'blinkleft',
  blinkleft: 'blinkleft',
  blinkr: 'blinkright',
  blinkright: 'blinkright',
  e: 'ee',
  fcleyeclose: 'blink',
  fcleyeclosel: 'blinkleft',
  fcleyecloser: 'blinkright',
  fclmtha: 'aa',
  fclmthe: 'ee',
  fclmthi: 'ih',
  fclmtho: 'oh',
  fclmthu: 'ou',
  i: 'ih',
  lookdown: 'lookdown',
  lookleft: 'lookleft',
  lookright: 'lookright',
  lookup: 'lookup',
  o: 'oh',
  u: 'ou',
};

export const PROTECTED_EXPRESSION_KEYS = new Set([
  'aa',
  'ih',
  'ou',
  'ee',
  'oh',
  'blink',
  'blinkleft',
  'blinkright',
  'lookdown',
  'lookleft',
  'lookright',
  'lookup',
]);

export function normalizeVrmExpressionKey(value: string) {
  return value
    .trim()
    .replace(/^vrm[-_\s.]*expression[-_\s.]*/i, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

export function resolveProtectedExpressionKey(value: string) {
  const normalized = normalizeVrmExpressionKey(value);
  const aliased = PROTECTED_EXPRESSION_ALIASES[normalized] ?? normalized;
  return PROTECTED_EXPRESSION_KEYS.has(aliased) ? aliased : null;
}

export function isProtectedExpressionName(name: string) {
  return resolveProtectedExpressionKey(name) != null;
}

function hasProtectedBracketExpression(trackName: string) {
  const bracketPattern = /\[([^\]]+)\]/g;
  let match = bracketPattern.exec(trackName);
  while (match) {
    if (match[1] && isProtectedExpressionName(match[1])) {
      return true;
    }
    match = bracketPattern.exec(trackName);
  }
  return false;
}

function getVrmExpressionNodeName(trackName: string) {
  const nodeName = trackName.split('.')[0] ?? trackName;
  return /^vrm[-_\s.]*expression/i.test(nodeName) ? nodeName : null;
}

function isKnownProtectedExpressionNodeName(trackName: string) {
  const nodeName = trackName.split('.')[0] ?? trackName;
  const normalized = normalizeVrmExpressionKey(nodeName);
  if (/^fcl(?:mth|eye)/.test(normalized)) {
    return isProtectedExpressionName(nodeName);
  }
  return PROTECTED_EXPRESSION_KEYS.has(normalized);
}

function getExpressionPathName(trackName: string) {
  const match =
    /(?:^|[.\]])(?:expressionmap|presetexpressionmap|presetexpressions|expressions)[._-]([a-z0-9_-]+)/i.exec(
      trackName,
    );
  return match?.[1] ?? null;
}

export function isProtectedExpressionTrackName(trackName: string) {
  if (hasProtectedBracketExpression(trackName)) {
    return true;
  }

  const vrmExpressionNodeName = getVrmExpressionNodeName(trackName);
  if (vrmExpressionNodeName && isProtectedExpressionName(vrmExpressionNodeName)) {
    return true;
  }

  if (isKnownProtectedExpressionNodeName(trackName)) {
    return true;
  }

  const expressionPathName = getExpressionPathName(trackName);
  return expressionPathName ? isProtectedExpressionName(expressionPathName) : false;
}
