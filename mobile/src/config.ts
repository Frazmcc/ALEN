export const config = {
  apiBaseUrl:
    process.env.EXPO_PUBLIC_ALEN_API_URL ??
    'https://alen-api-lquw.onrender.com',
} as const;
