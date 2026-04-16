import { useCameraStore, type AspectRatio, type FlashMode } from '@/store/cameraStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { manipulateAsync } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AppStateStatus
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
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
  const isFocused = useIsFocused();
  const cameraRef = useRef<Camera>(null);
  const [latestAsset, setLatestAsset] = React.useState<MediaLibrary.Asset | null>(null);
  const [appState, setAppState] = React.useState<AppStateStatus>(AppState.currentState);
  // カメラの選択状態を管理（フロント/バック）
  const [isFrontCamera, setIsFrontCamera] = React.useState(false);
  // 選択されたカメラデバイスを取得
  const device = useCameraDevice(isFrontCamera ? 'front' : 'back');
  const [zoom, setZoom] = React.useState(1);
  const pinchStartZoomRef = useRef(1);
  
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
  
  // 【要件1】動的なカメラフォーマット選択
  // 【重要】videoResolution と photoResolution を 'max' に設定して最高画質を確保
  // useCameraFormat は複数の条件を評価して、最適なフォーマットを自動選択する
  const format = useCameraFormat(device, [
    {
      videoAspectRatio: aspectRatio === '16:9' ? 16 / 9 : 4 / 3,
      photoAspectRatio: aspectRatio === '16:9' ? 16 / 9 : 4 / 3,
      videoResolution: 'max',
      photoResolution: 'max',
    },
  ]);

  // デバッグ：実際に選ばれたフォーマットとデバイス情報をログ出力
  React.useEffect(() => {
    if (device) {
      console.log(`📱 Device: ${device.name || device.id} (${isFrontCamera ? 'FRONT' : 'BACK'})`);
    }
    if (format) {
      console.log(`📸 Format selected:`, format);
    }
  }, [device, format, isFrontCamera]);

  const [isProcessing, setIsProcessing] = React.useState(false);
  const isAppForeground = appState === 'active';
  const isCameraActive = isAppForeground && isFocused;

  const minZoom = device?.minZoom ?? 1;
  const neutralZoom = device?.neutralZoom ?? minZoom;
  const maxZoom = React.useMemo(() => {
    if (!device) {
      return 1;
    }

    const practicalMax = neutralZoom * 5;
    const deviceMax = device.maxZoom ?? practicalMax;

    return Math.max(minZoom, Math.min(deviceMax, practicalMax));
  }, [device, minZoom, neutralZoom]);

  React.useEffect(() => {
    if (!device) {
      return;
    }

    const initialZoom = clamp(neutralZoom, minZoom, maxZoom);
    setZoom(initialZoom);
    pinchStartZoomRef.current = initialZoom;
  }, [device, minZoom, neutralZoom, maxZoom]);

  const pinchGesture = React.useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartZoomRef.current = zoom;
        })
        .onUpdate((event) => {
          const nextZoom = clamp(
            pinchStartZoomRef.current * event.scale,
            minZoom,
            maxZoom
          );

          setZoom((prev) => (Math.abs(prev - nextZoom) < 0.001 ? prev : nextZoom));
        })
        .onEnd(() => {
          pinchStartZoomRef.current = zoom;
        }),
    [zoom, minZoom, maxZoom]
  );

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

  const handleSettingsPress = useCallback(() => {
    router.push('/settings');
  }, [router]);

  // MediaLibrary パーミッション管理
  const [mediaLibraryPermission, requestMediaLibraryPermission] = MediaLibrary.usePermissions();

  const loadLatestAsset = useCallback(async () => {
    try {
      if (mediaLibraryPermission?.granted === false) {
        setLatestAsset(null);
        return;
      }

      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]],
        first: 1,
      });

      setLatestAsset(result.assets[0] ?? null);
    } catch (error) {
      console.warn('⚠️ Failed to load latest asset thumbnail:', error);
      setLatestAsset(null);
    }
  }, [mediaLibraryPermission]);

  const handleGalleryPress = useCallback(() => {
    router.push('/gallery');
  }, [router]);

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

  React.useEffect(() => {
    if (mediaLibraryPermission?.granted) {
      loadLatestAsset();
    }
  }, [mediaLibraryPermission, loadLatestAsset]);

  useFocusEffect(
    useCallback(() => {
      loadLatestAsset();
    }, [loadLatestAsset])
  );

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      const nextCameraActive = nextState === 'active' && isFocused;

      console.log(
        `[CameraLifecycle] AppState changed: ${nextState}, focused: ${isFocused}, cameraActive: ${nextCameraActive}`
      );

      if (nextState !== 'active') {
        console.log('[CameraLifecycle] Home/background detected. Camera should be OFF.');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused]);

  React.useEffect(() => {
    console.log(
      `[CameraLifecycle] cameraActive=${isCameraActive} (appState=${appState}, focused=${isFocused})`
    );
  }, [isCameraActive, appState, isFocused]);

  // Vision Camera v4では autofocusはデフォルトで有効です

  // 【要件4】1:1撮影時の画像クロップ処理（中央から正方形に切り取る）
  const cropImageToSquare = useCallback(async (imageUri: string): Promise<string> => {
    try {
      // 1. 画像サイズを取得
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        // @ts-ignore Image の型定義
        if (!Image || !Image.getSize) {
          console.warn('⚠️ Image.getSize not available, using fallback');
          // フォールバック：一般的な 4:3 のサイズを想定
          resolve({ width: 1080, height: 1440 });
          return;
        }

        // @ts-ignore
        Image.getSize(
          imageUri,
          (w: number, h: number) => {
            console.log(`📐 Image size: ${w}x${h}`);
            resolve({ width: w, height: h });
          },
          (error: any) => {
            console.warn(`⚠️ Could not get image size: ${error}, using fallback`);
            // エラー時は 4:3 比率を想定
            resolve({ width: 1080, height: 1440 });
          }
        );
      });

      // 2. 最小辺を基準に正方形サイズを決定
      const squareSize = Math.min(size.width, size.height);
      const originX = (size.width - squareSize) / 2;
      const originY = (size.height - squareSize) / 2;

      console.log(`🔳 Cropping: ${size.width}x${size.height} -> ${squareSize}x${squareSize}`);

      // 3. クロップを実行
      const result = await manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(squareSize),
              height: Math.round(squareSize),
            },
          },
        ],
        { compress: 1 }
      );

      console.log(`✅ Crop completed`);
      return result.uri;
    } catch (error) {
      console.error('❌ Crop failed:', error);
      return imageUri;
    }
  }, []);

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
      let snapshotUri = (await cameraRef.current.takeSnapshot({
        quality: 100,
      }))?.path;

      if (!snapshotUri) {
        console.warn('⚠️ Snapshot returned null');
        Alert.alert('エラー', 'スナップショット取得に失敗しました。カメラをリセットして再度お試しください');
        return;
      }

      // 【要件4】1:1 選択時のみクロップ処理を実行
      if (aspectRatio === '1:1') {
        console.log('🔳 1:1 aspect ratio detected - applying crop...');
        snapshotUri = await cropImageToSquare(snapshotUri);
      } else {
        console.log(`📸 Snapshot captured with ${aspectRatio} aspect ratio`);
      }

      // クロップ済み（または元の）画像をデフォルトカメラロールに保存
      // 【重要】saveToLibraryAsync() は自動的にデフォルトの写真アプリと同期される
      await MediaLibrary.saveToLibraryAsync(snapshotUri);
      await loadLatestAsset();

      setLastPhotoPath(snapshotUri);
      onPhotoCapture?.(snapshotUri);

      Alert.alert('成功', '写真が保存されました');
    } catch (error) {
      console.error('❌ takeSnapshot failed:', error);
      // takeSnapshot 失敗時の詳細なエラーメッセージ
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      Alert.alert('エラー', `スナップショット撮影に失敗しました: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  }, [isRecording, device, aspectRatio, cropImageToSquare, onPhotoCapture, setLastPhotoPath, mediaLibraryPermission, requestMediaLibraryPermission, loadLatestAsset]);

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
          try {
            // 動画をデフォルトカメラロールに保存
            // 【重要】saveToLibraryAsync() は自動的にデフォルトの写真アプリと同期される
            await MediaLibrary.saveToLibraryAsync(video.path);
            await loadLatestAsset();

            setLastVideoPath(video.path);
            onVideoRecorded?.(video.path);

            setRecording(false);
            Alert.alert('成功', '動画が保存されました');
          } catch (error) {
            console.error('Failed to save video to library:', error);
            setRecording(false);
            Alert.alert('エラー', '動画の保存に失敗しました');
          }
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
  }, [device, onVideoRecorded, setLastVideoPath, setRecording, mediaLibraryPermission, requestMediaLibraryPermission, loadLatestAsset]);

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
    <View style={styles.container}>
      {/* 【レイヤー1】カメラプレビュー - 背景層 */}
      <View style={styles.cameraPreviewContainer}>
        <GestureDetector gesture={pinchGesture}>
          <View style={styles.pinchGestureWrapper}>
            {/* 【要件2】UI動的リサイズ - アスペクト比制御＆マスキング */}
            <View
              style={[
                styles.cameraAspectRatioWrapper,
                {
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
                pixelFormat="yuv"
                zoom={zoom}
              />
            </View>
          </View>
        </GestureDetector>
      </View>

      {/* 【レイヤー2】UI層 - 前景層（カメラの上に重ねる） */}
      <SafeAreaView style={styles.uiOverlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.headerContainer} pointerEvents="box-none">
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

        <View style={{ flex: 1 }} pointerEvents="none" />

        <View style={styles.footerContainer} pointerEvents="box-none">
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
              {latestAsset ? (
                <>
                  <Image source={{ uri: latestAsset.uri }} style={styles.galleryThumbnail} />
                  {latestAsset.mediaType === 'video' && (
                    <View style={styles.galleryVideoBadge}>
                      <MaterialCommunityIcons name="play" size={14} color="#fff" />
                    </View>
                  )}
                </>
              ) : (
                <MaterialCommunityIcons name="image-plus" size={22} color="#fff" />
              )}
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
  container: { flex: 1, width: '100%', height: '100%', backgroundColor: '#000' },
  // 【要件2】【要件3】カメラプレビュー領域 - 画面全体を覆う
  cameraPreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    width: '100%',
    height: '100%',
  },
  // 【要件2】アスペクト比ラッパー - 動的にリサイズ＆マスキング
  pinchGestureWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  cameraAspectRatioWrapper: {
    overflow: 'hidden',
    width: '100%',
  },
  uiOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
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
    overflow: 'hidden',
  },
  galleryThumbnail: {
    width: '100%',
    height: '100%',
  },
  galleryVideoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
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

