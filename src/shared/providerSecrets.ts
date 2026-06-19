export type ProviderSecretLike = {
  keyName?: string;
  secret?: string;
};

export function mapProviderSecrets(
  secrets: ProviderSecretLike[] | undefined,
): Record<string, string> {
  return Object.fromEntries(
    (secrets ?? [])
      .filter((secret): secret is Required<ProviderSecretLike> =>
        Boolean(secret.keyName && secret.secret),
      )
      .map((secret) => [secret.keyName, secret.secret]),
  );
}
