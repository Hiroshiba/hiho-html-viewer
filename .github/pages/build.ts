import type { Dirent } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  join,
  parse,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";

const pageListPlaceholder = "<div data-page-list></div>";
const faviconSourceRelativePath = join(".github", "pages", "favicon.png");
const generatedFaviconPath = "favicon.png";
const generatedStylePath = "viewer.css";
const excludedDirectoryNames = new Set(["node_modules", "_site"]);

const buildOptionsSchema = z.strictObject({
  sourceDirectory: z
    .string({ error: "ソースディレクトリは文字列で指定してください" })
    .min(1, { error: "ソースディレクトリを指定してください" }),
  outputDirectory: z
    .string({ error: "出力ディレクトリは文字列で指定してください" })
    .min(1, { error: "出力ディレクトリを指定してください" }),
});

const indexTemplateSchema = z
  .string({ error: "ルートのindex.htmlを文字列として読み込めませんでした" })
  .min(1, { error: "ルートのindex.htmlが空です" });

type BuildOptions = z.infer<typeof buildOptionsSchema>;

interface PlannedAsset {
  destinationRelativePath: string;
  kind: "asset";
  sourceRelativePath: string;
}

interface PlannedPage {
  destinationRelativePath: string;
  kind: "page";
  label: string;
  sourceRelativePath: string;
  urlPath: string;
}

type PlannedFile = PlannedAsset | PlannedPage;

type DestinationOwner =
  | {
      description: string;
      kind: "generated";
    }
  | {
      kind: "source";
      sourceRelativePath: string;
    };

/** 公開対象を収集し、GitHub Pages用の成果物を生成します。 */
export async function buildSite(options: BuildOptions): Promise<void> {
  const validatedOptions = buildOptionsSchema.parse(options);
  const sourceDirectory = resolve(validatedOptions.sourceDirectory);
  const outputDirectory = resolve(validatedOptions.outputDirectory);

  validateOutputDirectory(sourceDirectory, outputDirectory);
  await validateFaviconFile(sourceDirectory);

  const rootEntries = await readSortedEntries(sourceDirectory);
  validateIndexTemplateEntry(rootEntries);
  validateExistingOutputEntry(rootEntries);

  const indexTemplate = indexTemplateSchema.parse(
    await readFile(join(sourceDirectory, "index.html"), "utf8"),
  );
  const plannedFiles = await collectPlannedFiles(sourceDirectory, rootEntries);
  validateDestinations(plannedFiles);

  const pages = plannedFiles
    .filter(isPlannedPage)
    .toSorted((left: PlannedPage, right: PlannedPage): number =>
      compareStrings(left.label, right.label),
    );
  const renderedIndex = renderIndex(indexTemplate, pages);

  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await copyFavicon(sourceDirectory, outputDirectory);

  for (const plannedFile of plannedFiles) {
    await copyPlannedFile(sourceDirectory, outputDirectory, plannedFile);
  }

  await writeFile(join(outputDirectory, "index.html"), renderedIndex, "utf8");
}

async function validateFaviconFile(sourceDirectory: string): Promise<void> {
  const faviconStats = await lstat(
    join(sourceDirectory, faviconSourceRelativePath),
  );

  if (!faviconStats.isFile() || faviconStats.isSymbolicLink()) {
    throw new Error(
      `${formatPath(faviconSourceRelativePath)}は通常ファイルにしてください`,
    );
  }
}

function validateOutputDirectory(
  sourceDirectory: string,
  outputDirectory: string,
): void {
  const expectedOutputDirectory = join(sourceDirectory, "_site");

  if (outputDirectory !== expectedOutputDirectory) {
    throw new Error(
      `出力先はソース直下の_siteにしてください: ${outputDirectory}`,
    );
  }
}

function validateIndexTemplateEntry(rootEntries: Dirent[]): void {
  const indexEntry = rootEntries.find(
    (entry: Dirent): boolean => entry.name === "index.html",
  );
  assertNonNullable(indexEntry, "ルートにindex.htmlがありません");

  if (!indexEntry.isFile() || indexEntry.isSymbolicLink()) {
    throw new Error("ルートのindex.htmlは通常ファイルにしてください");
  }
}

function validateExistingOutputEntry(rootEntries: Dirent[]): void {
  const outputEntry = rootEntries.find(
    (entry: Dirent): boolean => entry.name === "_site",
  );

  if (outputEntry == null) {
    return;
  }

  if (!outputEntry.isDirectory() || outputEntry.isSymbolicLink()) {
    throw new Error("既存の_siteは通常ディレクトリにしてください");
  }
}

async function collectPlannedFiles(
  sourceDirectory: string,
  rootEntries: Dirent[],
): Promise<PlannedFile[]> {
  const plannedFiles: PlannedFile[] = [];

  for (const entry of rootEntries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) {
      continue;
    }

    if (entry.isSymbolicLink()) {
      throw new Error(`シンボリックリンクは公開できません: ${entry.name}`);
    }

    if (entry.isDirectory()) {
      await collectDirectoryFiles(sourceDirectory, entry.name, plannedFiles);
      continue;
    }

    if (entry.isFile()) {
      if (entry.name === "index.html") {
        continue;
      }

      if (entry.name.endsWith(".html")) {
        plannedFiles.push(createPagePlan(entry.name));
      }

      continue;
    }

    throw new Error(`未対応のファイル形式です: ${entry.name}`);
  }

  return plannedFiles;
}

async function collectDirectoryFiles(
  sourceDirectory: string,
  relativeDirectory: string,
  plannedFiles: PlannedFile[],
): Promise<void> {
  const entries = await readSortedEntries(
    join(sourceDirectory, relativeDirectory),
  );

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) {
      continue;
    }

    const sourceRelativePath = join(relativeDirectory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(
        `シンボリックリンクは公開できません: ${sourceRelativePath}`,
      );
    }

    if (entry.isDirectory()) {
      await collectDirectoryFiles(
        sourceDirectory,
        sourceRelativePath,
        plannedFiles,
      );
      continue;
    }

    if (entry.isFile()) {
      plannedFiles.push(createFilePlan(sourceRelativePath));
      continue;
    }

    throw new Error(`未対応のファイル形式です: ${sourceRelativePath}`);
  }
}

function createFilePlan(sourceRelativePath: string): PlannedFile {
  if (sourceRelativePath.endsWith(".html")) {
    return createPagePlan(sourceRelativePath);
  }

  return {
    destinationRelativePath: sourceRelativePath,
    kind: "asset",
    sourceRelativePath,
  };
}

function createPagePlan(sourceRelativePath: string): PlannedPage {
  const parsedPath = parse(sourceRelativePath);

  if (parsedPath.ext !== ".html") {
    throw new Error(`HTMLファイルではありません: ${sourceRelativePath}`);
  }

  const destinationRelativePath =
    parsedPath.base === "index.html"
      ? sourceRelativePath
      : join(parsedPath.dir, parsedPath.name, "index.html");
  const pageDirectory = dirname(destinationRelativePath);

  if (pageDirectory === ".") {
    throw new Error("ルートのindex.htmlは一覧ページ専用です");
  }

  const pathSegments = pageDirectory.split(sep);

  return {
    destinationRelativePath,
    kind: "page",
    label: `${pathSegments.join("/")}/`,
    sourceRelativePath,
    urlPath: `${pathSegments.map(encodeURIComponent).join("/")}/`,
  };
}

function validateDestinations(plannedFiles: PlannedFile[]): void {
  const destinations = new Map<string, DestinationOwner>();

  registerDestination(destinations, "index.html", {
    description: "一覧ページ",
    kind: "generated",
  });
  registerDestination(destinations, generatedFaviconPath, {
    description: "favicon",
    kind: "generated",
  });
  registerDestination(destinations, generatedStylePath, {
    description: "一覧ページ用CSS",
    kind: "generated",
  });

  for (const plannedFile of plannedFiles) {
    registerDestination(destinations, plannedFile.destinationRelativePath, {
      kind: "source",
      sourceRelativePath: plannedFile.sourceRelativePath,
    });
  }
}

function registerDestination(
  destinations: Map<string, DestinationOwner>,
  destinationPath: string,
  owner: DestinationOwner,
): void {
  if (destinations.has(destinationPath)) {
    const existingOwner = destinations.get(destinationPath);
    assertNonNullable(
      existingOwner,
      `公開先の管理情報がありません: ${destinationPath}`,
    );
    throw new Error(
      `公開先「${formatPath(destinationPath)}」が「${describeOwner(existingOwner)}」と「${describeOwner(owner)}」で重複しています`,
    );
  }

  for (const [existingPath, existingOwner] of destinations) {
    const destinationIsDescendant = destinationPath.startsWith(
      `${existingPath}${sep}`,
    );
    const existingIsDescendant = existingPath.startsWith(
      `${destinationPath}${sep}`,
    );

    if (destinationIsDescendant || existingIsDescendant) {
      throw new Error(
        `公開先「${formatPath(destinationPath)}」と「${formatPath(existingPath)}」が「${describeOwner(owner)}」と「${describeOwner(existingOwner)}」で衝突しています`,
      );
    }
  }

  destinations.set(destinationPath, owner);
}

function describeOwner(owner: DestinationOwner): string {
  if (owner.kind === "generated") {
    return owner.description;
  }

  return formatPath(owner.sourceRelativePath);
}

function formatPath(filePath: string): string {
  return filePath.split(sep).join("/");
}

function isPlannedPage(plannedFile: PlannedFile): plannedFile is PlannedPage {
  return plannedFile.kind === "page";
}

function renderIndex(indexTemplate: string, pages: PlannedPage[]): string {
  const templateParts = indexTemplate.split(pageListPlaceholder);

  if (templateParts.length !== 2) {
    throw new Error(
      `ルートのindex.htmlには${pageListPlaceholder}を1つだけ配置してください`,
    );
  }

  const templateStart = templateParts[0];
  const templateEnd = templateParts[1];
  assertNonNullable(templateStart, "一覧ページの前半を取得できませんでした");
  assertNonNullable(templateEnd, "一覧ページの後半を取得できませんでした");

  return `${templateStart}${renderPageList(pages)}${templateEnd}`;
}

function renderPageList(pages: PlannedPage[]): string {
  if (pages.length === 0) {
    return [
      '<div class="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">',
      '  <p class="text-base text-slate-600">公開されているページはありません。</p>',
      "</div>",
    ].join("\n");
  }

  const pageItems = pages.map(renderPageItem).join("\n");

  return [
    '<ul class="grid gap-4 md:grid-cols-2">',
    pageItems,
    "</ul>",
  ].join("\n");
}

function renderPageItem(page: PlannedPage): string {
  const escapedLabel = escapeHtml(page.label);
  const escapedUrlPath = escapeHtml(page.urlPath);

  return [
    "  <li>",
    `    <a class="flex min-h-36 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-700" href="${escapedUrlPath}">`,
    `      <span class="break-all font-mono text-sm leading-6 text-slate-700">${escapedLabel}</span>`,
    '      <span class="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-sky-700">ページを開く <span aria-hidden="true">→</span></span>',
    "    </a>",
    "  </li>",
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function copyPlannedFile(
  sourceDirectory: string,
  outputDirectory: string,
  plannedFile: PlannedFile,
): Promise<void> {
  const destinationPath = join(
    outputDirectory,
    plannedFile.destinationRelativePath,
  );
  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(
    join(sourceDirectory, plannedFile.sourceRelativePath),
    destinationPath,
  );
}

async function copyFavicon(
  sourceDirectory: string,
  outputDirectory: string,
): Promise<void> {
  await copyFile(
    join(sourceDirectory, faviconSourceRelativePath),
    join(outputDirectory, generatedFaviconPath),
  );
}

async function readSortedEntries(directoryPath: string): Promise<Dirent[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  return entries.toSorted((left: Dirent, right: Dirent): number =>
    compareStrings(left.name, right.name),
  );
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function assertNonNullable<T>(
  value: T,
  message: string,
): asserts value is NonNullable<T> {
  if (value == null) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const sourceDirectory = process.cwd();
  await buildSite({
    outputDirectory: join(sourceDirectory, "_site"),
    sourceDirectory,
  });
}

if (import.meta.main) {
  await main();
}
