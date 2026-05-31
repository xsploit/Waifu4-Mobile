export function getLocalCdnAssetUrl(assetPath: string) {
  return `/cdn-assets/${assetPath.replace(/^\/+/, '')}`;
}

export async function fetchGameAssetBlob(assetPath: string): Promise<Blob> {
  const normalizedPath = assetPath.replace(/^\/+/, '');
  const response = await fetch(getLocalCdnAssetUrl(normalizedPath));
  if (!response.ok) {
    throw new Error(`Asset fetch failed for ${normalizedPath} (${response.status})`);
  }

  return response.blob();
}
