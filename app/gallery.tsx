import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  PanResponder,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';

type GalleryViewMode = 'grid' | 'detail';

// Animated コンポーネント化
const AnimatedView = Animated.createAnimatedComponent(View);

export default function GalleryScreen() {
  const params = useLocalSearchParams<{ from?: string | string[]; open?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const openParam = Array.isArray(params.open) ? params.open[0] : params.open;
  const openLatestFromThumbnail = fromParam === 'thumbnail' && openParam === 'latest';
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [viewMode, setViewMode] = useState<GalleryViewMode>('grid');
  const [selectedAsset, setSelectedAsset] = useState<MediaLibrary.Asset | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const dragYAnim = useRef(new Animated.Value(0)).current;
  const dragScaleAnim = useRef(new Animated.Value(1)).current;
  const backdropOpacityAnim = useRef(new Animated.Value(0)).current;
  const hasInitializedByParams = useRef(false);
  const openFromCameraThumbnailRef = useRef(false);

  // ギャラリーから写真と動画を取得
  const loadAssets = useCallback(async () => {
    try {
      if (permission?.granted === false) {
        const result = await requestPermission();
        if (result?.granted === false) {
          console.warn('⚠️ Media library permission denied');
          setIsLoading(false);
          return;
        }
      }

      // カメラロールから全写真と動画を取得（最新順）
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        sortBy: [['creationTime', false]], // 最新順
        first: 100, // 最大100件取得
      });

      console.log(`📸 Loaded ${result.assets.length} assets from camera roll`);
      setAssets(result.assets);
    } catch (error) {
      console.error('❌ Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  // カメラ側のサムネイルタップ時は、最新アセットを最初に開く
  useEffect(() => {
    if (hasInitializedByParams.current || isLoading) {
      return;
    }

    hasInitializedByParams.current = true;

    if (openLatestFromThumbnail && assets.length > 0) {
      openFromCameraThumbnailRef.current = true;
      setSelectedAsset(assets[0]);
      setSelectedIndex(0);
      setViewMode('detail');
    }
  }, [isLoading, openLatestFromThumbnail, assets]);

  // 詳細ビューのズームインアニメーション
  useEffect(() => {
    if (viewMode === 'detail') {
      const fromCameraThumbnail = openFromCameraThumbnailRef.current;
      dragYAnim.setValue(0);
      dragScaleAnim.setValue(1);

      if (fromCameraThumbnail) {
        // カメラ左下サムネイル位置から広がるように見せる
        scaleAnim.setValue(0.2);
        translateXAnim.setValue(-(screenWidth * 0.42));
        translateYAnim.setValue(screenHeight * 0.34);
        backdropOpacityAnim.setValue(0);
      } else {
        scaleAnim.setValue(0.86);
        translateXAnim.setValue(0);
        translateYAnim.setValue(0);
        backdropOpacityAnim.setValue(0.5);
      }

      opacityAnim.setValue(0);

      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateXAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacityAnim, {
          toValue: 0.72,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      openFromCameraThumbnailRef.current = false;
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      translateXAnim.setValue(0);
      translateYAnim.setValue(0);
      dragYAnim.setValue(0);
      dragScaleAnim.setValue(1);
      backdropOpacityAnim.setValue(0);
    }
  }, [
    viewMode,
    scaleAnim,
    opacityAnim,
    translateXAnim,
    translateYAnim,
    dragYAnim,
    dragScaleAnim,
    backdropOpacityAnim,
    screenWidth,
    screenHeight,
  ]);

  // アセットをリフレッシュ（プルダウン更新）
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    await loadAssets();
  }, [loadAssets]);

  // 詳細ビューを開く
  const handleOpenDetail = useCallback((asset: MediaLibrary.Asset, index: number) => {
    openFromCameraThumbnailRef.current = false;
    setSelectedAsset(asset);
    setSelectedIndex(index);
    setViewMode('detail');
  }, []);

  // グリッドビューに戻る
  const handleBackToGrid = useCallback(() => {
    setViewMode('grid');
    setSelectedAsset(null);
  }, []);

  // 縮小しながらグリッドへ戻るアニメーション
  const animateBackToGrid = useCallback((targetTranslateY: number) => {
    Animated.parallel([
      Animated.timing(dragYAnim, {
        toValue: targetTranslateY,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(dragScaleAnim, {
        toValue: 0.82,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacityAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      handleBackToGrid();
      dragYAnim.setValue(0);
      dragScaleAnim.setValue(1);
      backdropOpacityAnim.setValue(0);
      translateXAnim.setValue(0);
      translateYAnim.setValue(0);
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    });
  }, [
    dragYAnim,
    dragScaleAnim,
    opacityAnim,
    backdropOpacityAnim,
    handleBackToGrid,
    translateXAnim,
    translateYAnim,
    scaleAnim,
  ]);

  // 削除処理
  const handleDelete = useCallback(async () => {
    if (!selectedAsset) return;

    try {
      // 削除時の確認は OS のシステムダイアログに任せる
      await MediaLibrary.deleteAssetsAsync([selectedAsset]);

      const updatedAssets = assets.filter((a) => a.id !== selectedAsset.id);
      setAssets(updatedAssets);
      handleBackToGrid();
    } catch (error) {
      console.error('❌ Failed to delete asset:', error);
    }
  }, [selectedAsset, assets, handleBackToGrid]);

  // 共有処理
  const handleShare = useCallback(async () => {
    if (!selectedAsset) return;

    try {
      Share.share({
        url: selectedAsset.uri,
        title: `Share ${selectedAsset.mediaType === 'video' ? 'Video' : 'Photo'}`,
        message: selectedAsset.mediaType === 'video' ? '動画です' : '写真です',
      });
    } catch (error) {
      console.error('❌ Failed to share:', error);
      Alert.alert('エラー', '共有に失敗しました');
    }
  }, [selectedAsset]);

  // 情報表示
  const handleShowInfo = useCallback(() => {
    if (!selectedAsset) return;

    const createdAtRaw = selectedAsset.creationTime;
    const createdAt = createdAtRaw
      ? new Date(createdAtRaw < 1_000_000_000_000 ? createdAtRaw * 1000 : createdAtRaw).toLocaleString('ja-JP')
      : '不明';
    const duration =
      selectedAsset.mediaType === 'video'
        ? `${Math.max(0, Math.round(selectedAsset.duration ?? 0))} 秒`
        : '-';
    const dimensions =
      selectedAsset.width && selectedAsset.height
        ? `${selectedAsset.width} x ${selectedAsset.height}`
        : '不明';

    Alert.alert(
      'メディア情報',
      [
        `種類: ${selectedAsset.mediaType === 'video' ? '動画' : '写真'}`,
        `ファイル名: ${selectedAsset.filename ?? '不明'}`,
        `解像度: ${dimensions}`,
        `長さ: ${duration}`,
        `作成日時: ${createdAt}`,
      ].join('\n')
    );
  }, [selectedAsset]);

  // 詳細ビューで横スワイプした後に現在インデックスを同期
  const handleDetailSwipeEnd = useCallback((offsetX: number) => {
    const nextIndex = Math.round(offsetX / screenWidth);

    if (nextIndex < 0 || nextIndex >= assets.length || nextIndex === selectedIndex) {
      return;
    }

    setSelectedIndex(nextIndex);
    setSelectedAsset(assets[nextIndex]);
  }, [assets, selectedIndex, screenWidth]);

  const detailPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt: unknown, gestureState: { dx: number; dy: number }) => {
          if (viewMode !== 'detail') {
            return false;
          }

          return (
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
            Math.abs(gestureState.dy) > 8
          );
        },
        onPanResponderMove: (_evt: unknown, gestureState: { dy: number }) => {
          const absDy = Math.abs(gestureState.dy);
          dragYAnim.setValue(gestureState.dy);
          dragScaleAnim.setValue(Math.max(0.82, 1 - absDy / 900));
          backdropOpacityAnim.setValue(Math.max(0, 0.72 - absDy / 260));
        },
        onPanResponderRelease: (_evt: unknown, gestureState: { dy: number; vy: number }) => {
          const shouldDismiss =
            Math.abs(gestureState.dy) > 120 || Math.abs(gestureState.vy) > 1.1;

          if (shouldDismiss) {
            const targetY = gestureState.dy >= 0 ? screenHeight : -screenHeight;
            animateBackToGrid(targetY);
            return;
          }

          Animated.parallel([
            Animated.spring(dragYAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 70,
              friction: 11,
            }),
            Animated.spring(dragScaleAnim, {
              toValue: 1,
              useNativeDriver: true,
              tension: 70,
              friction: 11,
            }),
            Animated.timing(backdropOpacityAnim, {
              toValue: 0.72,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        },
        onPanResponderTerminate: () => {
          Animated.parallel([
            Animated.spring(dragYAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 70,
              friction: 11,
            }),
            Animated.spring(dragScaleAnim, {
              toValue: 1,
              useNativeDriver: true,
              tension: 70,
              friction: 11,
            }),
            Animated.timing(backdropOpacityAnim, {
              toValue: 0.72,
              duration: 160,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [
      viewMode,
      dragYAnim,
      dragScaleAnim,
      backdropOpacityAnim,
      animateBackToGrid,
      screenHeight,
    ]
  );

  // 写真/動画をグリッドで表示
  const renderAsset = ({ item, index }: { item: MediaLibrary.Asset; index: number }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => handleOpenDetail(item, index)}
    >
      <Image
        source={{ uri: item.uri }}
        style={styles.assetImage}
      />
      {item.mediaType === 'video' && (
        <View style={styles.videoOverlay}>
          <MaterialCommunityIcons
            name="play-circle"
            size={32}
            color="#fff"
          />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderDetailAsset = useCallback(
    ({ item }: { item: MediaLibrary.Asset }) => (
      <View style={[styles.detailPage, { width: screenWidth }]}> 
        {item.mediaType === 'photo' ? (
          <Image
            source={{ uri: item.uri }}
            style={styles.detailImage}
          />
        ) : (
          <View style={styles.videoContainer}>
            <Image
              source={{ uri: item.uri }}
              style={styles.detailImage}
            />
            <View style={styles.videoBadge}>
              <MaterialCommunityIcons name="play" size={32} color="#fff" />
            </View>
          </View>
        )}
      </View>
    ),
    [screenWidth]
  );

  const getDetailItemLayout = useCallback(
    (_: ArrayLike<MediaLibrary.Asset> | null | undefined, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth]
  );

  if (openLatestFromThumbnail && !hasInitializedByParams.current && !isLoading && assets.length > 0) {
    return <View style={[styles.gridScreen, styles.gridScreenDark]} />;
  }

  // 【グリッドビュー】
  if (viewMode === 'grid') {
    if (isLoading) {
      return (
        <View style={[styles.gridScreen, openLatestFromThumbnail && styles.gridScreenDark]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        </View>
      );
    }

    if (assets.length === 0) {
      return (
        <View style={styles.gridScreen}>
          <View style={styles.container}>
            <Text style={styles.emptyText}>
              撮影した写真と動画がここに表示されます
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
            >
              <MaterialCommunityIcons name="refresh" size={24} color="#007AFF" />
              <Text style={styles.refreshText}>更新</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.gridScreen}>
        <View style={styles.container}>
          <FlatList
            data={assets}
            renderItem={renderAsset}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.row}
            refreshing={isLoading}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.gridContainer}
          />
        </View>
      </View>
    );
  }

  // 【詳細ビュー】
  if (viewMode === 'detail' && selectedAsset) {
    const animatedStyle = {
      transform: [
        { translateX: translateXAnim },
        { translateY: Animated.add(translateYAnim, dragYAnim) },
        { scale: Animated.multiply(scaleAnim, dragScaleAnim) },
      ],
      opacity: opacityAnim,
    };

    return (
      <View style={styles.gridScreen}>
        {/* 背面グリッド（フォルダー） */}
        <View style={styles.container}>
          <FlatList
            data={assets}
            renderItem={renderAsset}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.row}
            refreshing={isLoading}
            onRefresh={handleRefresh}
            contentContainerStyle={styles.gridContainer}
          />
        </View>

        {/* 背景保護レイヤー - 縦スワイプで薄くなってフォルダーが見える */}
        <AnimatedView style={[styles.blackBackdrop, { opacity: backdropOpacityAnim }]} />

        {/* 詳細ビュー */}
        <AnimatedView
          style={[styles.detailContainer, animatedStyle]}
          {...detailPanResponder.panHandlers}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          {/* ヘッダー */}
          <View style={styles.detailHeader}>
          <TouchableOpacity
            style={styles.detailHeaderButton}
            onPress={() => animateBackToGrid(0)}
          >
            <MaterialCommunityIcons name="folder" size={24} color="#007AFF" />
            <Text style={styles.detailHeaderButtonText}>フォルダー</Text>
          </TouchableOpacity>

          <Text style={styles.detailCounter}>
            {selectedIndex + 1} / {assets.length}
          </Text>
        </View>

        {/* メインコンテンツ */}
        <View style={styles.detailContent}>
          <FlatList
            data={assets}
            horizontal
            pagingEnabled
            scrollEnabled={assets.length > 1}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={renderDetailAsset}
            initialScrollIndex={selectedIndex}
            getItemLayout={getDetailItemLayout}
            onMomentumScrollEnd={(event) => handleDetailSwipeEnd(event.nativeEvent.contentOffset.x)}
          />
        </View>

        {/* フッター */}
        <View style={styles.detailFooter}>
          <TouchableOpacity
            style={styles.footerButton}
            onPress={handleDelete}
          >
            <MaterialCommunityIcons name="trash-can" size={28} color="#ff3b30" />
            <Text style={[styles.footerButtonText, { color: '#ff3b30' }]}>削除</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.footerButton}
            onPress={handleShowInfo}
          >
            <MaterialCommunityIcons name="information-outline" size={28} color="#007AFF" />
            <Text style={[styles.footerButtonText, { color: '#007AFF' }]}>情報</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.footerButton}
            onPress={handleShare}
          >
            <MaterialCommunityIcons name="share-variant" size={28} color="#34C759" />
            <Text style={[styles.footerButtonText, { color: '#34C759' }]}>共有</Text>
          </TouchableOpacity>
        </View>
        </SafeAreaView>
      </AnimatedView>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  gridScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f5f5f5',
  },
  gridScreenDark: {
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  gridContainer: {
    paddingBottom: 0,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  gridItem: {
    flex: 1 / 3,
    aspectRatio: 1,
    marginHorizontal: 0,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  assetImage: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  refreshText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8,
    fontWeight: '600',
  },

  // 【背景保護レイヤー】
  blackBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 1,
  },

  // 【詳細ビュー】
  detailContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailHeaderButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  detailCounter: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  detailContent: {
    flex: 1,
  },
  detailPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  detailImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  videoContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  videoBadge: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footerButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
