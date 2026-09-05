import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { firefox as playwrightFirefox } from '@playwright/test';
const options = new firefox.Options().addArguments('-headless');
options.setBinary(playwrightFirefox.executablePath());
options.setPreference('datareporting.policy.dataSubmissionEnabled', false);
const builder = new Builder().forBrowser('firefox').setFirefoxOptions(options);
if (process.env.GECKODRIVER_PATH) builder.setFirefoxService(new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH));
const driver = await builder.build();
try {
  const id = await driver.installAddon(resolve('dist/claude-counter-0.5.0-firefox.zip'), true);
  assert.equal(id, '{cf7799c8-d878-41ff-8005-167bee7ab3d6}');
  console.log(`Firefox installed unsigned review artifact with preserved add-on ID ${id}`);
  await driver.uninstallAddon(id);
} finally { await driver.quit(); }
