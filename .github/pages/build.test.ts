import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import type { TestContext } from "node:test";

import { buildSite } from "./build.ts";

const indexTemplate =
  '<html><head><link rel="icon" href="./favicon.png"></head><body><div data-page-list></div></body></html>';

void test(
  "HTMLを末尾スラッシュURLへ正規化して一覧へ追加する",
  async (context: TestContext): Promise<void> => {
    const sourceDirectory = await createSourceDirectory(context);
    await writeFixture(sourceDirectory, "hoge.html", "<h1>hoge</h1>");
    await writeFixture(
      sourceDirectory,
      join("bundle", "index.html"),
      "<h1>bundle</h1>",
    );
    await writeFixture(
      sourceDirectory,
      join("bundle", "image.png"),
      "image",
    );
    await writeFixture(
      sourceDirectory,
      join("nested", "White Space #.html"),
      "<h1>space</h1>",
    );
    await writeFixture(
      sourceDirectory,
      join("assets-only", "data.txt"),
      "data",
    );
    await writeFixture(sourceDirectory, "README.md", "README");
    await writeFixture(sourceDirectory, "prompt.txt", "prompt");
    await writeFixture(sourceDirectory, "root.css", "body {}");
    await writeFixture(
      sourceDirectory,
      join(".github", "private.txt"),
      "private",
    );
    await writeFixture(
      sourceDirectory,
      join("node_modules", "private.txt"),
      "private",
    );

    const outputDirectory = join(sourceDirectory, "_site");
    await buildSite({ outputDirectory, sourceDirectory });

    assert.equal(
      await readFile(join(outputDirectory, "hoge", "index.html"), "utf8"),
      "<h1>hoge</h1>",
    );
    assert.equal(
      await readFile(join(outputDirectory, "bundle", "image.png"), "utf8"),
      "image",
    );
    assert.equal(
      await readFile(join(outputDirectory, "assets-only", "data.txt"), "utf8"),
      "data",
    );
    await assertPathDoesNotExist(join(outputDirectory, "hoge.html"));
    await assertPathDoesNotExist(join(outputDirectory, "README.md"));
    await assertPathDoesNotExist(join(outputDirectory, "prompt.txt"));
    await assertPathDoesNotExist(join(outputDirectory, "root.css"));
    await assertPathDoesNotExist(join(outputDirectory, ".github"));
    await assertPathDoesNotExist(join(outputDirectory, "node_modules"));
    assert.equal(
      await readFile(join(outputDirectory, "favicon.png"), "utf8"),
      "favicon",
    );

    assert.equal(
      await readFile(
        join(outputDirectory, "nested", "White Space #", "index.html"),
        "utf8",
      ),
      "<h1>space</h1>",
    );

    const renderedIndex = await readFile(
      join(outputDirectory, "index.html"),
      "utf8",
    );
    assert.match(renderedIndex, /href="bundle\/"/u);
    assert.match(renderedIndex, /href="hoge\/"/u);
    assert.match(
      renderedIndex,
      /href="nested\/White%20Space%20%23\/"/u,
    );
    assert.match(renderedIndex, /nested\/White Space #\//u);
    assert.match(renderedIndex, /href="\.\/favicon\.png"/u);
    assert.doesNotMatch(renderedIndex, /data-page-list/u);
  },
);

void test(
  "同じ公開URLになるHTMLがある場合は失敗する",
  async (context: TestContext): Promise<void> => {
    const sourceDirectory = await createSourceDirectory(context);
    await writeFixture(sourceDirectory, "hoge.html", "<h1>file</h1>");
    await writeFixture(
      sourceDirectory,
      join("hoge", "index.html"),
      "<h1>directory</h1>",
    );

    await assert.rejects(
      buildSite({
        outputDirectory: join(sourceDirectory, "_site"),
        sourceDirectory,
      }),
      /公開先.*hoge.*index\.html.*重複しています/u,
    );
  },
);

void test(
  "変換先のディレクトリとファイルが衝突する場合は失敗する",
  async (context: TestContext): Promise<void> => {
    const sourceDirectory = await createSourceDirectory(context);
    await writeFixture(
      sourceDirectory,
      join("pages", "item.html"),
      "<h1>item</h1>",
    );
    await writeFixture(sourceDirectory, join("pages", "item"), "asset");

    await assert.rejects(
      buildSite({
        outputDirectory: join(sourceDirectory, "_site"),
        sourceDirectory,
      }),
      /公開先.*衝突しています/u,
    );
  },
);

void test(
  "_site以外を出力先に指定した場合は失敗する",
  async (context: TestContext): Promise<void> => {
    const sourceDirectory = await createSourceDirectory(context);

    await assert.rejects(
      buildSite({
        outputDirectory: join(sourceDirectory, "dist"),
        sourceDirectory,
      }),
      /出力先はソース直下の_siteにしてください/u,
    );
  },
);

async function createSourceDirectory(context: TestContext): Promise<string> {
  const sourceDirectory = await mkdtemp(
    join(tmpdir(), "hiho-html-viewer-test-"),
  );
  context.after(async (): Promise<void> => {
    await rm(sourceDirectory, { force: true, recursive: true });
  });
  await writeFixture(sourceDirectory, "index.html", indexTemplate);
  await writeFixture(
    sourceDirectory,
    join(".github", "pages", "favicon.png"),
    "favicon",
  );

  return sourceDirectory;
}

async function writeFixture(
  sourceDirectory: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = join(sourceDirectory, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function assertPathDoesNotExist(filePath: string): Promise<void> {
  await assert.rejects(access(filePath), { code: "ENOENT" });
}
