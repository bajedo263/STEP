/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Identité STEP : un indigo électrique pour l'action (boutons, tracés, ses cases),
 * le vert pour l'objectif atteint, l'orange pour les lieux à voir, le rouge pour les rivaux.
 */
export const Colors = {
  light: {
    text: '#12121A',
    background: '#FFFFFF',
    backgroundElement: '#F2F2F7',
    backgroundSelected: '#E2E2EC',
    textSecondary: '#62626F',
    tint: '#4B3FF0',
    onTint: '#FFFFFF',
    success: '#16A34A',
    danger: '#D93036',
  },
  dark: {
    text: '#F5F5FA',
    background: '#0E0E14',
    backgroundElement: '#1C1C26',
    backgroundSelected: '#2C2C3A',
    textSecondary: '#A6A6B4',
    tint: '#6C63FF',
    onTint: '#FFFFFF',
    success: '#3DD56D',
    danger: '#FF6369',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Coins arrondis des cartes et des boutons. */
export const Radius = {
  card: 24,
  tile: 18,
  pill: 999,
} as const;
export const MaxContentWidth = 800;
/** Repères des points d'intérêt, sur la carte et pendant la marche. */
export const PoiColor = '#F08C00';
/** Lieux déjà découverts. */
export const VisitedPoiColor = '#2F9E44';
/** Conquête : cases à soi et cases prises par d'autres marcheurs. */
export const ConquestMineColor = '#4B3FF0';
export const ConquestOtherColor = '#E03131';
/** Cases des amis. */
export const ConquestFriendColor = '#0CA5B0';
