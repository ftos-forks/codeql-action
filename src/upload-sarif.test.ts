import * as fs from "fs";
import * as path from "path";

import test, { ExecutionContext } from "ava";
import * as sinon from "sinon";

import { AnalysisKind, getAnalysisConfig } from "./analyses";
import { getRunnerLogger } from "./logging";
import { createFeatures, setupTests } from "./testing-utils";
import { UploadResult } from "./upload-lib";
import * as uploadLib from "./upload-lib";
import { postProcessAndUploadSarif } from "./upload-sarif";
import * as util from "./util";

setupTests(test);

interface UploadSarifExpectedResult {
  uploadResult?: UploadResult;
  expectedFiles?: string[];
}

function mockPostProcessSarifFiles() {
  const postProcessSarifFiles = sinon.stub(uploadLib, "postProcessSarifFiles");

  for (const analysisKind of Object.values(AnalysisKind)) {
    const analysisConfig = getAnalysisConfig(analysisKind);
    postProcessSarifFiles
      .withArgs(
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        sinon.match.any,
        analysisConfig,
      )
      .resolves({ sarif: { runs: [] }, analysisKey: "", environment: "" });
  }

  return postProcessSarifFiles;
}

const postProcessAndUploadSarifMacro = test.macro({
  exec: async (
    t: ExecutionContext<unknown>,
    sarifFiles: string[],
    sarifPath: (tempDir: string) => string = (tempDir) => tempDir,
    expectedResult: Partial<Record<AnalysisKind, UploadSarifExpectedResult>>,
  ) => {
    await util.withTmpDir(async (tempDir) => {
      const logger = getRunnerLogger(true);
      const testPath = sarifPath(tempDir);
      const features = createFeatures([]);

      const toFullPath = (filename: string) => path.join(tempDir, filename);

      const postProcessSarifFiles = mockPostProcessSarifFiles();
      const uploadPostProcessedFiles = sinon.stub(
        uploadLib,
        "uploadPostProcessedFiles",
      );

      for (const analysisKind of Object.values(AnalysisKind)) {
        const analysisConfig = getAnalysisConfig(analysisKind);
        uploadPostProcessedFiles
          .withArgs(logger, sinon.match.any, analysisConfig, sinon.match.any)
          .resolves(expectedResult[analysisKind as AnalysisKind]?.uploadResult);
      }

      const fullSarifPaths = sarifFiles.map(toFullPath);
      for (const sarifFile of fullSarifPaths) {
        fs.writeFileSync(sarifFile, "");
      }

      const actual = await postProcessAndUploadSarif(
        logger,
        features,
        "always",
        "",
        testPath,
      );

      for (const analysisKind of Object.values(AnalysisKind)) {
        const analysisKindResult = expectedResult[analysisKind];
        if (analysisKindResult) {
          // We are expecting a result for this analysis kind, check that we have it.
          t.deepEqual(actual[analysisKind], analysisKindResult.uploadResult);
          // Additionally, check that the mocked `postProcessSarifFiles` was called with only the file paths
          // that we expected it to be called with.
          t.assert(
            postProcessSarifFiles.calledWith(
              logger,
              features,
              sinon.match.any,
              analysisKindResult.expectedFiles?.map(toFullPath) ??
                fullSarifPaths,
              sinon.match.any,
              getAnalysisConfig(analysisKind),
            ),
          );
        } else {
          // Otherwise, we are not expecting a result for this analysis kind. However, note that `undefined`
          // is also returned by our mocked `uploadProcessedFiles` when there is no expected result for this
          // analysis kind.
          t.is(actual[analysisKind], undefined);
          // Therefore, we also check that the mocked `uploadProcessedFiles` was not called for this analysis kind.
          t.assert(
            !uploadPostProcessedFiles.calledWith(
              logger,
              sinon.match.any,
              getAnalysisConfig(analysisKind),
              sinon.match.any,
            ),
            `uploadProcessedFiles was called for ${analysisKind}, but should not have been.`,
          );
        }
      }
    });
  },
  title: (providedTitle = "") => `processAndUploadSarif - ${providedTitle}`,
});

test(
  "SARIF file",
  postProcessAndUploadSarifMacro,
  ["test.sarif"],
  (tempDir) => path.join(tempDir, "test.sarif"),
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
    },
  },
);

test(
  "JSON file",
  postProcessAndUploadSarifMacro,
  ["test.json"],
  (tempDir) => path.join(tempDir, "test.json"),
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
    },
  },
);

test(
  "Code Scanning files",
  postProcessAndUploadSarifMacro,
  ["test.json", "test.sarif"],
  undefined,
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
      expectedFiles: ["test.sarif"],
    },
  },
);

test(
  "Code Quality file",
  postProcessAndUploadSarifMacro,
  ["test.quality.sarif"],
  (tempDir) => path.join(tempDir, "test.quality.sarif"),
  {
    "code-quality": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-quality-sarif",
      },
    },
  },
);

test(
  "Mixed files",
  postProcessAndUploadSarifMacro,
  ["test.sarif", "test.quality.sarif"],
  undefined,
  {
    "code-scanning": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-scanning-sarif",
      },
      expectedFiles: ["test.sarif"],
    },
    "code-quality": {
      uploadResult: {
        statusReport: {},
        sarifID: "code-quality-sarif",
      },
      expectedFiles: ["test.quality.sarif"],
    },
  },
);

test("postProcessAndUploadSarif doesn't upload if upload is disabled", async (t) => {
  await util.withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const features = createFeatures([]);

    const toFullPath = (filename: string) => path.join(tempDir, filename);

    const postProcessSarifFiles = mockPostProcessSarifFiles();
    const uploadPostProcessedFiles = sinon.stub(
      uploadLib,
      "uploadPostProcessedFiles",
    );

    fs.writeFileSync(toFullPath("test.sarif"), "");
    fs.writeFileSync(toFullPath("test.quality.sarif"), "");

    const actual = await postProcessAndUploadSarif(
      logger,
      features,
      "never",
      "",
      tempDir,
    );

    t.truthy(actual);
    t.assert(postProcessSarifFiles.calledTwice);
    t.assert(uploadPostProcessedFiles.notCalled);
  });
});

test("postProcessAndUploadSarif writes post-processed SARIF files if output directory is provided", async (t) => {
  await util.withTmpDir(async (tempDir) => {
    const logger = getRunnerLogger(true);
    const features = createFeatures([]);

    const toFullPath = (filename: string) => path.join(tempDir, filename);

    const postProcessSarifFiles = mockPostProcessSarifFiles();

    fs.writeFileSync(toFullPath("test.sarif"), "");
    fs.writeFileSync(toFullPath("test.quality.sarif"), "");

    const postProcessedOutPath = path.join(tempDir, "post-processed");
    const actual = await postProcessAndUploadSarif(
      logger,
      features,
      "never",
      "",
      tempDir,
      "",
      postProcessedOutPath,
    );

    t.truthy(actual);
    t.assert(postProcessSarifFiles.calledTwice);
    t.assert(fs.existsSync(path.join(postProcessedOutPath, "upload.sarif")));
    t.assert(
      fs.existsSync(path.join(postProcessedOutPath, "upload.quality.sarif")),
    );
  });
});
