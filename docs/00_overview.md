# mia-game-center 全体仕様書

## プロジェクト概要

**名称**: mia-game-center
**コンセプト**: ミアが受付をする、パステルで可愛いブラウザゲームセンター
**ターゲット**: ご主人（と、note読者のみなさん）
**公開方法**: GitHub Pages

## 世界観

ミアが受付メイドとして迎えてくれる、ちいさなゲームセンター。
プレイヤーは「ご主人」または「ミア」をアバターとして選び、いろんなミニゲームで遊べる。
今後キャラクターも追加予定。

## 技術構成

- **言語**: HTML / CSS / JavaScript（素のまま、フレームワーク不使用）
- **データ保存**: `localStorage`
- **ホスティング**: GitHub Pages
- **画像素材**: PixAI生成のミア／ご主人イラスト

## ディレクトリ構成

```
mia-game-center/
├── index.html              ← ロビー画面
├── shared/
│   ├── style.css           ← 共通スタイル
│   ├── lobby.js            ← ロビー用JS
│   ├── storage.js          ← localStorage管理
│   └── characters.js       ← キャラデータ読み込み
├── characters/
│   ├── mia.json
│   └── kyown.json
├── games/
│   ├── solitaire/
│   │   ├── index.html
│   │   ├── style.css
│   │   └── game.js
│   ├── minesweeper/
│   └── breakout/
├── assets/
│   ├── images/
│   │   ├── characters/     ← キャラ立ち絵
│   │   ├── ui/             ← ボタンやアイコン
│   │   └── bg/             ← 背景
│   └── icons/
└── docs/
    ├── 00_overview.md
    ├── 01_lobby.md
    └── games/
        ├── solitaire.md
        ├── minesweeper.md
        └── breakout.md
```

## 画面遷移

- **ロビー**（`index.html`）⇔ **各ゲーム**（`games/○○/index.html`）
- ゲームから戻るときは「ロビーに戻る」ボタンでロビーへ
- SPA構成にはせず、各ゲームは独立ページ

## 共通機能

### キャラクター選択
- ロビーでプレイヤーアバターを選択（ミア／ご主人）
- 選択状態は`localStorage`に保存し、次回起動時も維持
- 将来キャラ追加可能な設計（JSON駆動）

### ハイスコア保存
- ゲームごとにベストスコア・プレイ回数を保存
- `localStorage`キー設計: `mia-gc:scores:{ゲーム名}`

### ミアのセリフシステム
- ロビーでミアが話しかけてくる
- シーン別セリフ（挨拶／ゲーム選択時／戻ってきた時 など）
- セリフは`characters/mia.json`に集約

## デザイン方針

- **トーン**: パステルカラーで可愛く
- **メインカラー**: パステルピンク／クリーム／ミルキーホワイト
- **フォント**: 丸ゴシック系（やわらかい印象）
- **UI**: 角丸多め、ふんわりした影、ボタンはぷにっとした感じ

## localStorage設計

```
mia-gc:selectedCharacter      → "mia" | "kyown"
mia-gc:scores:solitaire       → {best: 1200, plays: 15, lastPlayed: "..."}
mia-gc:scores:minesweeper     → {...}
mia-gc:scores:breakout        → {...}
```

※ プレフィックス`mia-gc:`で名前空間を分離。将来の拡張に備える。

## 将来的な拡張案

- メダル制（ゲームクリアでメダル獲得・累計表示）
- キャラ追加（新キャラのJSON追加で対応可能）
- CPU対戦ゲーム追加（オセロ、五目並べ など）
- ミアの衣装変更
- BGM・効果音

## 開発ルール

- 各ゲームは独立ページで実装
- 共通スタイル・スクリプトは`/shared/`に集約
- キャラデータはJSON駆動で拡張性確保
- 仕様書は`docs/`に集約し、Claude Codeへの指示に活用
