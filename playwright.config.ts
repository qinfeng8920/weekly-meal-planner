import {defineConfig,devices} from '@playwright/test';
const executablePath=process.env.TTJ_CHROMIUM;
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.ts',timeout:45000,workers:1,
  use:{...devices['Pixel 7'],baseURL:'http://127.0.0.1:4173/weekly-meal-planner/',
    launchOptions:executablePath?{executablePath}:undefined,trace:'retain-on-failure'},
  webServer:{command:'node scripts/test-server.mjs',url:'http://127.0.0.1:4173/weekly-meal-planner/',timeout:10000}
});
