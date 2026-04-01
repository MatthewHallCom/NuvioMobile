// posthog-react-native web stub. Used in 1 file.
import React from 'react';

export const usePostHog = () => ({
  capture: (_event: string, _properties?: any) => {},
  identify: (_id: string, _properties?: any) => {},
  reset: () => {},
  optIn: () => {},
  optOut: () => {},
  isFeatureEnabled: (_key: string) => false,
  getFeatureFlag: (_key: string) => undefined,
  screen: (_name: string, _properties?: any) => {},
});

export const PostHogProvider = ({ children }: any) => children;

export default { usePostHog, PostHogProvider };
