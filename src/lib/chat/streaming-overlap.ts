export function findOverlappingSuffix(prefix: string, finalText: string) {
  const normalizedPrefix = prefix.trim();
  const normalizedFinal = finalText.trim();
  if (!normalizedPrefix || !normalizedFinal) {
    return normalizedFinal;
  }
  if (normalizedFinal.startsWith(normalizedPrefix)) {
    return normalizedFinal.slice(normalizedPrefix.length);
  }

  const maxOverlap = Math.min(normalizedPrefix.length, normalizedFinal.length);
  for (let length = maxOverlap; length >= 32; length -= 1) {
    const prefixTail = normalizedPrefix.slice(-length);
    const finalHead = normalizedFinal.slice(0, length);
    if (prefixTail === finalHead) {
      return normalizedFinal.slice(length);
    }
  }

  return '';
}
