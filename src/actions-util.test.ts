import * as github from "@actions/github";
import test from "ava";

import { getPullRequestBranches, isAnalyzingPullRequest } from "./actions-util";
import { computeAutomationID } from "./api-client";
import { EnvVar } from "./environment";
import { setupTests } from "./testing-utils";
import { initializeEnvironment } from "./util";

setupTests(test);

function withMockedContext<T>(mockPayload: any, testFn: () => T): T {
  const originalContext = github.context;
  github.context.payload = mockPayload;
  try {
    return testFn();
  } finally {
    github.context.payload = originalContext.payload;
  }
}

function withMockedEnv<T>(
  envVars: Record<string, string | undefined>,
  testFn: () => T,
): T {
  const originalEnv = { ...process.env };

  // Apply environment changes
  for (const [key, value] of Object.entries(envVars)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return testFn();
  } finally {
    // Restore original environment
    process.env = originalEnv;
  }
}

test("computeAutomationID()", async (t) => {
  let actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"language": "javascript", "os": "linux"}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
  );

  // check the environment sorting
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"os": "linux", "language": "javascript"}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/language:javascript/os:linux/",
  );

  // check that an empty environment produces the right results
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    "{}",
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/",
  );

  // check non string environment values
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    '{"number": 1, "object": {"language": "javascript"}}',
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/number:/object:/",
  );

  // check undefined environment
  actualAutomationID = computeAutomationID(
    ".github/workflows/codeql-analysis.yml:analyze",
    undefined,
  );
  t.deepEqual(
    actualAutomationID,
    ".github/workflows/codeql-analysis.yml:analyze/",
  );
});

test("getPullRequestBranches() with pull request context", (t) => {
  withMockedContext(
    {
      pull_request: {
        number: 123,
        base: { ref: "main" },
        head: { label: "user:feature-branch" },
      },
    },
    () => {
      t.deepEqual(getPullRequestBranches(), {
        base: "main",
        head: "user:feature-branch",
      });
      t.is(isAnalyzingPullRequest(), true);
    },
  );
});

test("getPullRequestBranches() with Default Setup environment variables", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: "refs/heads/feature-branch",
        CODE_SCANNING_BASE_BRANCH: "main",
      },
      () => {
        t.deepEqual(getPullRequestBranches(), {
          base: "main",
          head: "refs/heads/feature-branch",
        });
        t.is(isAnalyzingPullRequest(), true);
      },
    );
  });
});

test("getPullRequestBranches() returns undefined when only CODE_SCANNING_REF is set", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: "refs/heads/feature-branch",
        CODE_SCANNING_BASE_BRANCH: undefined,
      },
      () => {
        t.is(getPullRequestBranches(), undefined);
        t.is(isAnalyzingPullRequest(), false);
      },
    );
  });
});

test("getPullRequestBranches() returns undefined when only CODE_SCANNING_BASE_BRANCH is set", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: undefined,
        CODE_SCANNING_BASE_BRANCH: "main",
      },
      () => {
        t.is(getPullRequestBranches(), undefined);
        t.is(isAnalyzingPullRequest(), false);
      },
    );
  });
});

test("getPullRequestBranches() returns undefined when no PR context", (t) => {
  withMockedContext({}, () => {
    withMockedEnv(
      {
        CODE_SCANNING_REF: undefined,
        CODE_SCANNING_BASE_BRANCH: undefined,
      },
      () => {
        t.is(getPullRequestBranches(), undefined);
        t.is(isAnalyzingPullRequest(), false);
      },
    );
  });
});

test("initializeEnvironment", (t) => {
  initializeEnvironment("1.2.3");
  t.deepEqual(process.env[EnvVar.VERSION], "1.2.3");
});
