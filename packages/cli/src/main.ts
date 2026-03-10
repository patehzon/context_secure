#!/usr/bin/env node

import { executeCli } from './index.js';

const exitCode = await executeCli(process.argv.slice(2), {
  fetch_impl: fetch
});

process.exitCode = exitCode;
