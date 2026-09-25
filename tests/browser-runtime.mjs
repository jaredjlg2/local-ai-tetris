import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const channel=process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined);
export const browserOptions={headless:true,...(channel?{channel}:{})};
