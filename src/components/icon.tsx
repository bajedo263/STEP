import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text } from 'react-native';

type SFSymbol = Extract<SymbolViewProps['name'], string>;

/** Icône SF Symbols sur iPhone ; ailleurs, un emoji de repli. */
export function Icon({
  ios,
  fallback,
  color,
  size = 20,
}: {
  ios: SFSymbol;
  fallback: string;
  color: string;
  size?: number;
}) {
  return (
    <SymbolView
      name={{ ios }}
      tintColor={color}
      size={size}
      fallback={<Text style={{ fontSize: size * 0.8 }}>{fallback}</Text>}
    />
  );
}
