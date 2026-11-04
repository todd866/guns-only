// Capture the Saucer Springs AFB launcher poster from the playable game, without HUD.
// node tools/rc/card-art.cjs <out.png>. Headless hardware Chromium; silent audio.
// The shot is composed, not a spawn frame: the harness (never production) patches main.js in
// flight to expose the scene camera and car placement, parks the player's car facing the
// skatepark's graffiti quarter, and holds a low toy's-eye camera behind it.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../../web/smoke/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../web/wwwroot');
// World metres: car on the plaza floor west of the quarter, aimed at the alien piece.
const CAR={x:-3023.6,z:-789.0,yaw:1.85},CAMERA=[-3025.4,.5,-788.3],LOOK=[-3018.8,-.35,-790.9],FOV=50;
(async()=>{let server,browser;
try{
 server=await require('./serve-static.cjs')(root,8893);
 browser=await chromium.launch({headless:true,channel:'chromium',args:['--mute-audio']});
 const page=await browser.newPage({viewport:{width:900,height:1120}});
 await page.route('**/rc/main.js',route=>{
  const source=fs.readFileSync(path.join(root,'rc/main.js'),'utf8'),anchor='const camera=new T.PerspectiveCamera(63,1,.06,210);';
  if(!source.includes(anchor))throw Error('card-art: camera anchor moved in main.js');
  route.fulfill({contentType:'text/javascript',body:source.replace(anchor,anchor+'window.__card={camera,place:(x,z,yaw)=>placeCar(s.car,[x,rideHeight(s.car.params)+.02,z],yaw)};')});
 });
 await page.goto('http://127.0.0.1:8893/rc/?audioQa=silent&telemetry=off');
 await page.waitForFunction(()=>window.__gunsOnlyRC?.snapshot().assets==='blender',null,{timeout:90000});
 await page.waitForTimeout(1500);
 await page.evaluate(({CAR,CAMERA,LOOK,FOV})=>{const {camera,place}=window.__card;place(CAR.x,CAR.z,CAR.yaw);
  const update=camera.updateMatrixWorld.bind(camera);camera.updateMatrixWorld=force=>{camera.position.set(...CAMERA);camera.lookAt(...LOOK);if(camera.fov!==FOV){camera.fov=FOV;camera.updateProjectionMatrix();}update(force);};},{CAR,CAMERA,LOOK,FOV});
 await page.waitForTimeout(2500);
 await page.addStyleTag({content:'body > :not(#view){visibility:hidden!important}'});
 await page.screenshot({path:process.argv[2]});
}finally{await browser?.close();await server?.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
