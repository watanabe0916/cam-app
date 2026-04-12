import { useCameraStore, type AspectRatio, type FlashMode } from '@/store/cameraStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';

const FLASH_MODES: FlashMode[] = ['auto', 'on', 'off'];
const ASPECT_RATIOS: AspectRatio[] = ['16:9', '4:3', '1:1'];

// アスペクト比の表示ラベルマップ（内部値 → 表示値：縦型で表示）
const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  '16:9': '9:16',
  '4:3': '3:4',
  '1:1': '1:1',
};

// アスペクト比を数値（幅÷高さ）に変換
const ASPECT_RATIO_VALUES: Record<AspectRatio, number> = {
  '16:9': 9 / 16,
  '4:3': 3 / 4,
  '1:1': 1,
};

const FLASH_ICONS = {
  auto: 'flash-auto',
  on: 'flash',
  off: 'flash-off',
} as const;

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
  // カメラの選択状態を管理（フロント/バック）
  const [isFrontCamera, setIsFrontCamera] = React.useState(false);
  // 選択されたカメラデバイスを取得
  const device = useCameraDevice(isFrontCamera ? 'front' : 'back');
  
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
  
  // アスペクト比に対応するカメラフォーマットを取得
  const format = useCameraFormat(device, [
    { videoResolution: 'max' },
  ]);

  const [isProcessing, setIsProcessing] = React.useState(false);
  // 【エコ設定】アプリのバックグラウンド状態を管理
  const [isAppForeground, setIsAppForeground] = React.useState(true);
  // 【エコ設定】カメラ画面のフォーカス状態を取得
  const isFocused = useIsFocused();
  // 【エコ設定】カメラ有効判定：フォアグラウンド かつ フォーカス中
  const isCameraActive = isAppForeground && isFocused;

  const handleFlashToggle = useCallback(() => {
    // フロントカメラではフラッシュトグルをスキップ
    if (isFrontCamera) {
      return;
    }
    const currentIndex = FLASH_MODES.indexOf(flashMode);
    const nextIndex = (currentIndex + 1) % FLASH_MODES.length;
    setFlashMode(FLASH_MODES[nextIndex]);
  }, [flashMode, setFlashMode, isFrontCamera]);

  const handleCameraToggle = useCallback(() => {
    setIsFrontCamera(!isFrontCamera);
  }, [isFrontCamera]);

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

  // 【エコ設定】アプリのバックグラウンド状態をリッスン
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsAppForeground(state === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

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
      {/* 【アスペクト比制御】指定されたアスペクト比でカメラプレビューをクロップ */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            aspectRatio: ASPECT_RATIO_VALUES[aspectRatio],
          },
        ]}
      >
        {/* 【エコ設定】カメラはフォアグラウンド＆フォーカス時のみ有効化 */}
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isCameraActive}
          photo={isPhotoMode}
          video={true}
          audio={!isPhotoMode && isAudioEnabled}
          format={format}
        />
      </View>

      <SafeAreaView style={styles.safeAreaContainer} edges={['top']}>
        <View style={styles.headerContainer}>
          <TouchableOpacity
            style={[styles.headerButton, isFrontCamera && {opacity: 0.3}]}
            onPress={handleFlashToggle}
            disabled={isFrontCamera}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={isFrontCamera ? FLASH_ICONS.off : FLASH_ICONS[flashMode]}
              size={28}
              color={isFrontCamera ? '#999' : '#fff'}
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
                <Text style={[
                  styles.aspectRatioText,
                  aspectRatio === ratio && styles.aspectRatioTextActive,
                ]}>
                  {ASPECT_RATIO_LABELS[ratio]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleCameraToggle}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="camera-flip"
              size={28}
              color="#fff"
            />
          </TouchableOpacity>
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
              <MaterialCommunityIcons name="image-plus" size={22} color="#fff" />
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
              <MaterialCommunityIcons name="cog" size={22} color="#fff" />
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
    paddingTop: 8,
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
    width: 50,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  aspectRatioButtonActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
    borderColor: '#007AFF',
  },
  aspectRatioText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aspectRatioTextActive: {
    color: '#007AFF',
  },
  footerContainer: {
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 0,
  },
  modeTabContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 4 },
  modeTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
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
    paddingVertical: 8,
    paddingBottom: 12,
  },
  galleryButton: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  shutterButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  shutterButtonPressed: { backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  shutterButtonDisabled: { opacity: 0.6 },
  shutterButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
  },
  recordButtonRecording: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
    borderColor: '#ff4444',
  },
  recordButtonText: { fontSize: 28, color: '#fff', fontWeight: 'bold' },
  settingsButton: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  errorText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});

