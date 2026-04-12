import { useCameraStore } from '@/store/cameraStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { isAudioEnabled, setAudioEnabled } = useCameraStore();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
      >
        <MaterialCommunityIcons name="arrow-left" size={24} color="#007AFF" />
      </TouchableOpacity>

      <Text style={styles.title}>設定</Text>

      <ScrollView style={styles.settingsList}>
        {/* 音声有効切り替え */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabel}>
            <MaterialCommunityIcons
              name={isAudioEnabled ? 'volume-high' : 'volume-mute'}
              size={24}
              color="#333"
            />
            <Text style={styles.settingText}>動画の音声録音</Text>
          </View>
          <Switch
            value={isAudioEnabled}
            onValueChange={setAudioEnabled}
            trackColor={{ false: '#ccc', true: '#81C784' }}
            thumbColor={'#fff'}
          />
        </View>

        {/* 画質設定（プレースホルダー） */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabel}>
            <MaterialCommunityIcons name="image-size-select-actual" size={24} color="#333" />
            <Text style={styles.settingText}>画質</Text>
          </View>
          <Text style={styles.settingValue}>1080p</Text>
        </View>

        {/* フォーマット設定（プレースホルダー） */}
        <View style={styles.settingItem}>
          <View style={styles.settingLabel}>
            <MaterialCommunityIcons name="format-list-checks" size={24} color="#333" />
            <Text style={styles.settingText}>ファイル形式</Text>
          </View>
          <Text style={styles.settingValue}>HEIC / MP4</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingTop: 60,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 16,
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 40,
  },
  settingsList: {
    flex: 1,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  settingLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  settingValue: {
    fontSize: 14,
    color: '#999',
  },
});
