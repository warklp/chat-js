export type SocialAuthSignInOptions = {
  disableRedirect?: boolean;
  errorCallbackURL?: string;
  newUserCallbackURL?: string;
};

export type SocialAuthProvider = "google" | "github" | "vercel";

export function isSocialAuthProvider(
  value: string | null | undefined
): value is SocialAuthProvider {
  return value === "google" || value === "github" || value === "vercel";
}

export function sortSocialAuthProvidersByLastUsed<
  TProvider extends { id: SocialAuthProvider },
>(
  providers: readonly TProvider[],
  lastUsedProvider: string | null | undefined
): TProvider[] {
  if (!isSocialAuthProvider(lastUsedProvider)) {
    return [...providers];
  }

  return [
    ...providers.filter(({ id }) => id === lastUsedProvider),
    ...providers.filter(({ id }) => id !== lastUsedProvider),
  ];
}
