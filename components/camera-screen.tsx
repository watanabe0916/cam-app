import { useCameraStore, type AspectRatio, type FlashMode } from '@/store/cameraStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Camera,
    useCameraDevice,
    useCameraPermission
} from 'react-native-vision-camera';

const FLASH_MODES: FlashMode[] = ['auto', 'on', 'off'];
const ASPECT_RATIOS: AspectRatio[] = ['16:9', '4:3', '1:1'];

const FLASH_ICONS: Record<FlashMode, string> = {
  auto: 'flash-auto',
  on: 'flash',
  off: 'flash-off',
};

export interface CameraScreenProps {
  onPhotoCapture?: (photoPath: string) => void;
  onVideoRecorded?: (videoPath: string) => void;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({
  onPhotoCapture,
  onVideoRecorded,
}) => {
  const router = useRouter();
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission: cameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();

  const {
    isPhotoMode,
    setPhotoMode,
    isRecording,
    setRecording,
    isAudioEnabled,
    setLastPhotoPath,
    setLastVideoPath,
    flashMode,
    setFlashMode,
    aspectRatio,
    setAspectRatio,
  } = useCameraStore();

  const [isProcessing, setIsProcessing] = React.useState(false);

  const handleFlashToggle = useCallback(() => {
    const currentIndex = FLASH_MODES.indexOf(flashMode);
    const nextIndex = (currentIndex + 1) % FLASH_MODES.length;
    setFlashMode(FLASH_MODES[nextIndex]);
  }, [flashMode, setFlashMode]);

  const handleAspectRatioChange = useCallback((ratio: AspectRatio) => {
    setAspectRatio(ratio);
  }, [setAspectRatio]);

  const handleGalleryPress = useCallback(() => {
    router.push('/gallery');
  }, [router]);

  const handleSettingsPress = useCallback(() => {
    router.push('/settings');
  }, [router]);

  // MediaLibrary パーミッション管理
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();

  React.useEffect(() => {
    if (!cameraPermission) {
      requestCameraPermission();
    }
  }, [cameraPermission, requestCameraPermission]);

  React.useEffect(() => {
    if (mediaLibraryPermission === null) {
      requestMediaLibraryPermission();
    }
  }, [mediaLibraryPermission, requestMediaLibraryPermission]);

  // Vision Camera v4では autofocusはデフォルトで有効です

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;

    // カメラの状態確認（プレビューが準備完了しているか）
    if (!device || !cameraRef.current) {
      Alert.alert('エラー', 'カメラがまだ準備中です。もう一度お試しください');
      return;
    }

    // MediaLibrary パーミッション確認（毎回チェック）
    let currentPermission = mediaLibraryPermission;
    if (currentPermission?.granted === false) {
      const result = await requestMediaLibraryPermission();
      if (result?.granted === false) {
        Alert.alert('エラー', 'フォトライブラリへのアクセス許可が必要です');
        return;
      }
      currentPermission = result;
    }

    try {
      setIsProcessing(true);
      
      // 【重要】無音撮影のため takeSnapshot() を使用
      // iOS では video パイプラインからフレームをキャプチャするため、video=true が必須
      // （takePhoto() はシステムシャッター音を出すため使用禁止）
      const snapshot = await cameraRef.current.takeSnapshot({
        quality: 100,
      });

      if (!snapshot) {
        console.warn('⚠️ Snapshot returned null');
        Alert.alert('エラー', 'スナップショット取得に失敗しました。カメラをリセットして再度お試しください');
        return;
      }

      // スナップショットをメディアライブラリに保存
      const asset = await MediaLibrary.createAssetAsync(snapshot.path);
      await MediaLibrary.addAssetsToAlbumAsync([asset], 'Camera');

      setLastPhotoPath(snapshot.path);
      onPhotoCapture?.(snapshot.path);

      Alert.alert('成功', '写真が保存されました');
    } catch (error) {
      console.error('❌ takeSnapshot failed:', error);
      // takeSnapshot 失敗時の詳細なエラーメッセージ
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      Alert.alert('エラー', `スナップショット撮影に失敗しました: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [isRecording, device, onPhotoCapture, setLastPhotoPath, mediaLibraryPermission, requestMediaLibraryPermission]);

  const handleStartRecording = useCallback(async () => {
    if (!cameraRef.current || !device) return;

    // MediaLibrary パーミッション確認（毎回チェック）
    let currentPermission = mediaLibraryPermission;
    if (currentPermission?.granted === false) {
      const result = await requestMediaLibraryPermission();
      if (result?.granted === false) {
        Alert.alert('エラー', 'フォトライブラリへのアクセス許可が必要です');
        return;
      }
      currentPermission = result;
    }

    try {
      setRecording(true);
      cameraRef.current.startRecording({
        onRecordingFinished: async (video) => {
          const asset = await MediaLibrary.createAssetAsync(video.path);
          await MediaLibrary.addAssetsToAlbumAsync([asset], 'Camera');

          setLastVideoPath(video.path);
          onVideoRecorded?.(video.path);

          setRecording(false);
          Alert.alert('成功', '動画が保存されました');
        },
        onRecordingError: (error) => {
          console.error('Recording error:', error);
          setRecording(false);
          Alert.alert('エラー', '動画の録画に失敗しました');
        },
      });
    } catch (error) {
      console.error('Failed to start recording:', error);
      setRecording(false);
      Alert.alert('エラー', '動画の録画開始に失敗しました');
    }
  }, [device, onVideoRecorded, setLastVideoPath, setRecording, mediaLibraryPermission, requestMediaLibraryPermission]);

  const handleStopRecording = useCallback(async () => {
    // 録画中でない場合は処理をスキップ
    if (!cameraRef.current || !isRecording) return;

    try {
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('エラー', '動画の録画停止に失敗しました');
    }
  }, [isRecording])

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>カメラデバイスが見つかりません</Text>
      </View>
    );
  }

  if (!cameraPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>カメラへのアクセス許可が必要です</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={isPhotoMode}
        video={true}
        audio={!isPhotoMode && isAudioEnabled}
      />

      <SafeAreaView style={styles.safeAreaContainer}>
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleFlashToggle}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={FLASH_ICONS[flashMode] as any}
              size={28}
              color="#fff"
            />
          </TouchableOpacity>

          <View style={styles.aspectRatioContainer}>
            {ASPECT_RATIOS.map((ratio) => (
              <TouchableOpacity
                key={ratio}
                style={[
                  styles.aspectRatioButton,
                  aspectRatio === ratio && styles.aspectRatioButtonActive,
                ]}
                onPress={() => handleAspectRatioChange(ratio)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={
                    ratio === '16:9'
                      ? 'aspect-ratio'
                      : ratio === '4:3'
                        ? 'rectangle'
                        : 'circle-medium'
                  }
                  size={18}
                  color={aspectRatio === ratio ? '#007AFF' : '#fff'}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.headerButton} />
        </View>

        <View style={{ flex: 1 }} />

        <View style={styles.footerContainer}>
          <View style={styles.modeTabContainer}>
            <Pressable
              style={[styles.modeTab, isPhotoMode && styles.modeTabActive]}
              onPress={() => setPhotoMode(true)}
            >
              <MaterialCommunityIcons
                name="camera"
                size={20}
                color={isPhotoMode ? '#007AFF' : '#999'}
              />
            </Pressable>
            <Pressable
              style={[styles.modeTab, !isPhotoMode && styles.modeTabActive]}
              onPress={() => setPhotoMode(false)}
            >
              <MaterialCommunityIcons
                name="video"
                size={20}
                color={!isPhotoMode ? '#007AFF' : '#999'}
              />
            </Pressable>
          </View>

          <View style={styles.shutterArea}>
            <TouchableOpacity
              style={styles.galleryButton}
              onPress={handleGalleryPress}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="image-plus" size={24} color="#fff" />
            </TouchableOpacity>

            {isPhotoMode ? (
              <Pressable
                style={({ pressed }) => [
                  styles.shutterButton,
                  pressed && styles.shutterButtonPressed,
                  isProcessing && styles.shutterButtonDisabled,
                ]}
                onPress={handleTakePhoto}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <View style={styles.shutterButtonInner} />
                )}
              </Pressable>
            ) : (
              <TouchableOpacity
                style={[
                  styles.shutterButton,
                  isRecording && styles.recordButtonRecording,
                ]}
                onPress={isRecording ? handleStopRecording : handleStartRecording}
              >
                <Text style={styles.recordButtonText}>
                  {isRecording ? '⏹' : '●'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.settingsButton}
              onPress={handleSettingsPress}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="cog" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeAreaContainer: { flex: 1, justifyContent: 'space-between' },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  aspectRatioContainer: { flexDirection: 'row', gap: 8 },
  aspectRatioButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  aspectRatioButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    borderColor: '#007AFF',
  },
  footerContainer: {
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modeTabContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 12 },
  modeTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  modeTabActive: { backgroundColor: 'rgba(0, 122, 255, 0.2)', borderColor: '#007AFF' },
  shutterArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  galleryButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shutterButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  shutterButtonPressed: { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  shutterButtonDisabled: { opacity: 0.6 },
  shutterButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  recordButtonRecording: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
    borderColor: '#ff4444',
  },
  recordButtonText: { fontSize: 28, color: '#fff', fontWeight: 'bold' },
  settingsButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  errorText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});

