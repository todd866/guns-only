#!/usr/bin/env node
import { chromium } from '../../web/smoke/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output=process.env.SCENERY_QA_OUTPUT??'/tmp/guns-okanagan-qa';
const origin=process.env.SCENERY_QA_ORIGIN??'http://127.0.0.1:8035';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const evidence=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const view of ['beach','hillside','big-white','silverstar','apex','baldy']) {
    await page.goto(`${origin}/scenery?audioQa=silent&view=${view}`,{waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>document.querySelector('#stats')?.textContent.includes('triangles'),null,{timeout:90000});
    await page.screenshot({path:path.join(output,`${view}.png`)});
    evidence.push({view,stats:await page.locator('#stats').innerText(),errors:[...errors]});
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${origin}/scenery?audioQa=silent&quality=mobile&view=beach`,{waitUntil:'load',timeout:90000});
  await page.waitForFunction(()=>document.querySelector('#stats')?.textContent.includes('triangles'),null,{timeout:90000});
  await page.screenshot({path:path.join(output,'peachland-phone.png')});
  evidence.push({view:'peachland-phone',stats:await page.locator('#stats').innerText(),errors:[...errors]});
  if(errors.length)throw new Error(errors.join('\n'));
} finally {await writeFile(path.join(output,'scenery.json'),JSON.stringify(evidence,null,2)+'\n');await browser.close();}
console.log(JSON.stringify(evidence));
