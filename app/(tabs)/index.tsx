import { CameraScreen } from '@/components/camera-screen';
import { View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1 }}>
      <CameraScreen />
    </View>
  );
}
