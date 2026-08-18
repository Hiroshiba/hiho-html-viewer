# hiho-html-viewer

このリポジトリへ追加したHTMLページをGitHub Pagesで公開します。各ページへのリンクはトップページへ自動で追加します。

## HTMLページを追加する

画像やCSSなどの外部ファイルを使わないページは、HTMLファイルだけで追加できます。

| 配置 | 公開URL |
| --- | --- |
| `hoge.html` | `https://hihok.github.io/hiho-html-viewer/hoge/` |
| `hoge/index.html` | `https://hihok.github.io/hiho-html-viewer/hoge/` |
| `foo/bar.html` | `https://hihok.github.io/hiho-html-viewer/foo/bar/` |
| `My Page.html` | `https://hihok.github.io/hiho-html-viewer/My%20Page/` |

画像やCSSを使うページは、専用のディレクトリにまとめます。HTMLを `index.html` として置くと、素材への相対パスを変えずに公開できます。

```text
hoge/
  index.html
  image.png
  style.css
```

## 公開時の変換と制約

ルートの `index.html` は一覧ページのテンプレートです。次の文字列を1つだけ配置してください。ビルド時にこの文字列がページ一覧へ置き換わります。

```html
<div data-page-list></div>
```

`index.html` 以外のHTMLは、同じ名前のディレクトリにある `index.html` へ変換します。たとえば `hoge.html` は `hoge/index.html`、`foo/bar.html` は `foo/bar/index.html` になります。この変換によって相対パスの基準も変わります。素材を使うページは、ディレクトリ配下の `index.html` として配置してください。

変換後の出力先が重複する配置ではビルドが失敗します。`hoge.html` と `hoge/index.html` を同時に置く場合が該当します。変換後にファイルとディレクトリが衝突する配置も使用できません。

## 公開するファイル

公開対象は配置場所によって異なります。

- ルート直下では、一覧用の `index.html` と拡張子が `.html` のファイルだけを公開します
- サブディレクトリでは、HTMLに加えて画像やCSSなどのファイルもディレクトリ構造を維持して公開します

隠しファイルと隠しディレクトリ、`node_modules`、`_site` は公開しません。シンボリックリンクを含めるとビルドが失敗します。

## mainブランチへのpushで公開する

`main` ブランチへpushすると、GitHub Actionsが自動的にGitHub Pagesへデプロイします。Actions画面から手動実行することもできます。

最初のデプロイ前に、リポジトリ設定のPagesで公開元に `GitHub Actions` を選択してください。

ローカルから直接デプロイする方法はありません。

## ローカルで検証する

Node.js 24とpnpm 10を使用します。

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

生成物は `_site` に出力されます。
