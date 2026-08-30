export type SocialRuntimeConfig = {
  publicSocialEnabled: boolean;
  geoChatEnabled: boolean;
  nearbyEnabled: false;
  dmEnabled: boolean;
  bleDmEnabled: false;
  databaseConfigured: boolean;
  identityConfigured: boolean;
};

function enabled(value: string | undefined) {
  return value === "1" || value === "true";
}

type SocialRuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function getSocialRuntimeConfig(env: SocialRuntimeEnvironment = process.env): SocialRuntimeConfig {
  const databaseConfigured = Boolean(env.SOCIAL_DATABASE_URL || env.DATABASE_URL);
  const identityConfigured = enabled(env.SOCIAL_USER_IDENTITY_ENABLED)
    && env.SOCIAL_IDENTITY_MODE === "pseudonymous_session";
  const publicSocialEnabled = enabled(env.SOCIAL_PUBLIC_ENABLED) && databaseConfigured;
  const dmEnabled = enabled(env.DM_ENABLED) && databaseConfigured && identityConfigured;
  return {
    publicSocialEnabled,
    geoChatEnabled: publicSocialEnabled && enabled(env.GEOCHAT_ENABLED) && identityConfigured,
    nearbyEnabled: false,
    dmEnabled,
    bleDmEnabled: false,
    databaseConfigured,
    identityConfigured,
  };
}
