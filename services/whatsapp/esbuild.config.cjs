// Extra esbuild options, merged by Serverless v4 with `build.esbuild` in serverless.yml.
//
// The bundle is ESM, but CommonJS dependencies inside it (the AWS SDK pulled in through
// @vartalap/core) call require('node:https') etc. esbuild's ESM output has no `require`, so
// they crash at load with "Dynamic require of ... is not supported". This banner gives the
// bundle a real require for Node built-ins.
module.exports = () => ({
  banner: {
    js: "import { createRequire as __vtlCreateRequire } from 'node:module'; const require = __vtlCreateRequire(import.meta.url);",
  },
});
