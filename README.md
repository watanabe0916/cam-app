# cam-app

無音撮影を中心に設計した、iOS 向けカメラアプリです。  
Expo Router をベースに、react-native-vision-camera、Zustand、MMKV、expo-media-library を組み合わせて実装しています。

## 概要

このプロジェクトは、以下の実運用要件を満たすことを目的にしています。

- 無音での写真撮影
- アスペクト比の切り替え
- 1:1 撮影時の中央クロップ
- ピンチズーム
- 状態の永続化
- 端末フォトライブラリとの同期

## 主な実装機能

### 1. 無音撮影

- 写真撮影は Camera.takePhoto ではなく Camera.takeSnapshot を使用
- iOS でシステムシャッター音を回避するための構成
- 保存は expo-media-library の saveToLibraryAsync を利用

実装箇所: [components/camera-screen.tsx](components/camera-screen.tsx)

### 2. アスペクト比切り替え

- UI から 9:16、3:4、1:1 を選択可能
- 表示ラベルと内部値を分離し、縦構図向けに明示
- useCameraFormat でデバイスに対して最適フォーマットを選択

実装箇所: [components/camera-screen.tsx](components/camera-screen.tsx)

### 3. 1:1 クロップ

- 1:1 選択時のみクロップ処理を実行
- Image.getSize で実サイズ取得後、中央を正方形で切り出し
- expo-image-manipulator でクロップ

実装箇所: [components/camera-screen.tsx](components/camera-screen.tsx)

### 4. ピンチズーム

- react-native-gesture-handler の GestureDetector と Gesture.Pinch を使用
- zoom 値は Camera の zoom プロパティに反映
- minZoom と maxZoom の clamp を実施
- 実用上限として neutralZoom x 5 を採用

実装箇所: [components/camera-screen.tsx](components/camera-screen.tsx), [app/_layout.tsx](app/_layout.tsx)

### 5. Zustand による状態管理

- 撮影モード、録画状態、フラッシュ、アスペクト比などを一元管理
- MMKV ストレージで永続化
- アプリ再起動後も状態を復元

実装箇所: [store/cameraStore.ts](store/cameraStore.ts)

### 6. ギャラリー表示とページング

- 初回は一定件数を読み込み
- スクロール末尾で追加取得
- メディア詳細、削除、共有、情報表示に対応

実装箇所: [app/gallery.tsx](app/gallery.tsx)

## 技術スタック

- Expo 54
- React Native 0.81
- Expo Router 6
- react-native-vision-camera 4
- react-native-gesture-handler 2
- Zustand 5
- react-native-mmkv 4
- expo-media-library
- expo-image-manipulator

依存定義: [package.json](package.json)

## ディレクトリ構成（主要ファイル）

- ルートレイアウト: [app/_layout.tsx](app/_layout.tsx)
- 初期画面: [app/index.tsx](app/index.tsx)
- カメラ画面: [components/camera-screen.tsx](components/camera-screen.tsx)
- ギャラリー画面: [app/gallery.tsx](app/gallery.tsx)
- 状態管理: [store/cameraStore.ts](store/cameraStore.ts)
- Expo 設定: [app.json](app.json)

## 環境要件

開発環境は以下を推奨します。

- macOS
- Xcode（iOS SDK 含む）
- Node.js 18 以上
- npm
- CocoaPods
- Apple Developer アカウント（実機署名時）

## セットアップ手順

### 1. 依存インストール

```bash
npm install
```

### 2. iOS Bundle Identifier の設定

必要に応じて [app.json](app.json) の ios.bundleIdentifier を自分の識別子に変更します。

### 3. iOS 実機ビルド

```bash
npx expo run:ios --device
```

### 4. 開発サーバー起動

```bash
npx expo start
```

## iOS 実機ビルドが必要な理由

このアプリは、以下のネイティブ依存を使うため、実機検証が前提です。

- react-native-vision-camera
- react-native-mmkv
- カメラとフォトライブラリの実端末権限

特に無音撮影の挙動やズーム体験は、iOS シミュレータでは実運用に近い確認ができません。  
実機でのビルドと検証を必須としてください。

## 開発用コマンド

- 開発サーバー: `npx expo start`
- iOS 実機実行: `npx expo run:ios --device`
- Lint: `npm run lint`
- 型チェック: `npx tsc --noEmit`

## パーミッション

カメラ、マイク、フォトライブラリ権限は [app.json](app.json) の plugin 設定で定義しています。  
初回起動時に許可ダイアログが表示されるため、実機で確認してください。

## トラブルシューティング

### GestureDetector must be used as a descendant of GestureHandlerRootView

ルートを GestureHandlerRootView でラップしているか確認します。  
実装は [app/_layout.tsx](app/_layout.tsx) にあります。

### node_modules 内 tsconfig のエラー表示

依存ライブラリ配下の tsconfig 警告は、アプリ本体に影響しないケースがあります。  
まずはプロジェクトルートで型チェックを実行し、結果を基準に判断してください。

```bash
npx tsc --noEmit
```

### ズームが反応しない

以下を確認します。

- ルートが GestureHandlerRootView 配下になっている
- Camera オーバーレイの pointerEvents がジェスチャーを阻害していない
- 実機で検証している

## 補足

本 README は、現時点の実装状態を基準に記載しています。  
仕様変更時は、関連ソースと併せて更新してください。
