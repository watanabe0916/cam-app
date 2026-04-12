// eslint-disable-next-line import/no-extraneous-dependencies
import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist, StateStorage } from 'zustand/middleware';

// VS Code の自動削除を防ぐためのダミー変数代入
const _keepCreateMMKV = createMMKV;

// MMKV のインスタンスを遅延初期化（実行時に初期化）
let storageInstance: any = null;
let initializationAttempted = false;

const getStorage = () => {
  if (!storageInstance && !initializationAttempted) {
    initializationAttempted = true;
    try {
      // 標準的な静的インポートから MMKV を初期化
      const instance = _keepCreateMMKV();
      if (!instance) {
        throw new Error('createMMKV() returned undefined');
      }
      storageInstance = instance;
      console.log('✅ MMKV initialized successfully:', storageInstance.id);
    } catch (error) {
      console.error('❌ MMKV initialization failed:', error);
      // フォールバック: メモリストレージ
      storageInstance = {};
    }
  }
  return storageInstance || {};
};

const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    const storage = getStorage();
    if (storage.set) {
      return storage.set(name, value);
    }
    storage[name] = value;
    return true;
  },
  getItem: (name) => {
    const storage = getStorage();
    if (storage.getString) {
      const value = storage.getString(name);
      return value ?? null;
    }
    return storage[name] ?? null;
  },
  removeItem: (name) => {
    const storage = getStorage();
    if (storage.delete) {
      return storage.delete(name);
    }
    delete storage[name];
    return true;
  },
};

export type FlashMode = 'auto' | 'on' | 'off';
export type AspectRatio = '4:3' | '16:9' | '1:1';

export interface CameraState {
  // モード管理
  isPhotoMode: boolean;
  setPhotoMode: (isPhotoMode: boolean) => void;

  // 動画録画状態
  isRecording: boolean;
  setRecording: (isRecording: boolean) => void;

  // 音声有効フラグ
  isAudioEnabled: boolean;
  setAudioEnabled: (isAudioEnabled: boolean) => void;

  // 最後に保存された動画パス
  lastVideoPath: string | null;
  setLastVideoPath: (path: string | null) => void;

  // 最後に保存された写真パス
  lastPhotoPath: string | null;
  setLastPhotoPath: (path: string | null) => void;

  // フラッシュモード
  flashMode: FlashMode;
  setFlashMode: (mode: FlashMode) => void;

  // アスペクト比
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
}

export const useCameraStore = create<CameraState>()(
  persist(
    (set) => ({
      // デフォルト: 写真モード
      isPhotoMode: true,
      setPhotoMode: (isPhotoMode: boolean) => set({ isPhotoMode }),

      isRecording: false,
      setRecording: (isRecording: boolean) => set({ isRecording }),

      isAudioEnabled: false,
      setAudioEnabled: (isAudioEnabled: boolean) => set({ isAudioEnabled }),

      lastVideoPath: null,
      setLastVideoPath: (path: string | null) => set({ lastVideoPath: path }),

      lastPhotoPath: null,
      setLastPhotoPath: (path: string | null) => set({ lastPhotoPath: path }),

      flashMode: 'auto',
      setFlashMode: (mode: FlashMode) => set({ flashMode: mode }),

      aspectRatio: '16:9',
      setAspectRatio: (ratio: AspectRatio) => set({ aspectRatio: ratio }),
    }),
    {
      name: 'camera-store',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
