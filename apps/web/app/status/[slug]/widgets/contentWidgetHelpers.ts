export type SocialPlatform = 'github' | 'twitter' | 'discord' | 'linkedin' | 'youtube' | 'mastodon' | 'bluesky' | 'website';

export const SOCIAL_CONFIG_LABELS: Record<SocialPlatform, string> = {
  github: 'GitHub',
  twitter: 'Twitter / X',
  discord: 'Discord',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  mastodon: 'Mastodon',
  bluesky: 'Bluesky',
  website: 'Website',
};

export const SOCIAL_CONFIG_COLORS: Record<SocialPlatform, string> = {
  github: 'bg-neutral-700 hover:bg-neutral-600',
  twitter: 'bg-sky-700 hover:bg-sky-600',
  discord: 'bg-indigo-700 hover:bg-indigo-600',
  linkedin: 'bg-blue-800 hover:bg-blue-700',
  youtube: 'bg-red-700 hover:bg-red-600',
  mastodon: 'bg-purple-700 hover:bg-purple-600',
  bluesky: 'bg-sky-600 hover:bg-sky-500',
  website: 'bg-gray-700 hover:bg-gray-600',
};
