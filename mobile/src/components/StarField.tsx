import { View } from 'react-native';

const stars = [
  ['7%', '10%', 2, 0.95],
  ['13%', '28%', 1, 0.72],
  ['19%', '15%', 2, 0.82],
  ['25%', '38%', 1, 0.65],
  ['31%', '8%', 1, 0.85],
  ['36%', '25%', 2, 0.95],
  ['43%', '17%', 1, 0.68],
  ['49%', '34%', 2, 0.8],
  ['55%', '11%', 1, 0.74],
  ['61%', '29%', 1, 0.92],
  ['68%', '16%', 2, 0.78],
  ['73%', '39%', 1, 0.72],
  ['80%', '9%', 1, 0.85],
  ['86%', '25%', 2, 0.9],
  ['92%', '18%', 1, 0.72],
  ['10%', '47%', 1, 0.68],
  ['22%', '53%', 2, 0.88],
  ['39%', '48%', 1, 0.76],
  ['58%', '51%', 2, 0.86],
  ['76%', '49%', 1, 0.7],
  ['89%', '55%', 2, 0.9],
] as const;

export function StarField() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {stars.map(([left, top, size, opacity], index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left,
            top,
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: '#ffffff',
            opacity,
          }}
        />
      ))}
    </View>
  );
}
