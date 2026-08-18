# hiho-html-viewer

リポジトリに配置したHTMLをGitHub Pagesで公開します。公開ページはルートの一覧へ自動的に追加されます。

## ページを追加する

自己完結したHTMLはリポジトリ直下へ配置できます。

| 配置 | 公開URL |
| --- | --- |
| `hoge.html` | `https://hihok.github.io/hiho-html-viewer/hoge/` |
| `hoge/index.html` | `https://hihok.github.io/hiho-html-viewer/hoge/` |
| `foo/bar.html` | `https://hihok.github.io/hiho-html-viewer/foo/bar/` |
| `My Page.html` | `https://hihok.github.io/hiho-html-viewer/My%20Page/` |

画像やCSSを使用するページはディレクトリへまとめます。

```text
hoge/
  index.html
  image.png
  style.css
```

`hoge.html` と `hoge/index.html` のように公開URLが重複するHTMLを同時に置くと、ビルドは失敗します。

ルートの `index.html` は一覧ページのテンプレートです。`data-page-list` 属性を持つ要素を、ビルド時にページ一覧へ置き換えます。

## 公開対象

ルート直下ではHTMLだけを公開します。`README.md`、`prompt.txt`、パッケージ設定などは公開しません。

隠しファイルと隠しディレクトリ、`node_modules`、`_site` も公開しません。それ以外のディレクトリでは、HTMLに加えて画像やCSSなどもディレクトリ構造を維持して公開します。

`index.html` 以外のHTMLは、ファイル名と同じディレクトリの `index.html` へ変換します。この変換によって相対パスの基準も変わるため、ルート直下に置くHTMLは自己完結させてください。

## デプロイ

`main` ブランチへpushすると、GitHub Actionsが自動的にGitHub Pagesへデプロイします。Actions画面から手動実行することもできます。

最初のデプロイ前に、リポジトリ設定のPagesで公開元に `GitHub Actions` を選択してください。

ローカルから直接デプロイする方法はありません。

## 開発

Node.js 24とpnpm 10を使用します。

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

生成物は `_site` に出力されます。
