# Three.js r160 post-processing provenance

The post-processing and shader modules in `addons/postprocessing/` and
`addons/shaders/` are copied from the published `three@0.160.0` package:

- archive: `https://registry.npmjs.org/three/-/three-0.160.0.tgz`
- archive SHA-256: `1ee2f935c4f555814b388e87b5ef78a44856bd2e9d0feb88643a6e193fb42856`
- upstream paths: `examples/jsm/postprocessing/*` and `examples/jsm/shaders/*`
- license: Three.js MIT; see [`LICENSE`](./LICENSE)

The only local source change is replacing each bare `from 'three'` import with
`from '../../../three.module.js'`. Files without a core import are byte-identical
to the package. No pass, shader, threshold, blend, colour-management, or SMAA
algorithm was modified.

| Module | Upstream SHA-256 | Patched SHA-256 |
| --- | --- | --- |
| `addons/postprocessing/EffectComposer.js` | `d234e578618fa816955ebdc059c049c577e203e650e33cf22bde3f232c29e669` | `66942c78ecfb2129bd81e01698f0bd25a29552fbb37be619107a21c3284422e9` |
| `addons/postprocessing/MaskPass.js` | `328cf7db0da5d9be83ffe39d54b01d5ac1fddf108cc98182ddbb056f5c8b537f` | `328cf7db0da5d9be83ffe39d54b01d5ac1fddf108cc98182ddbb056f5c8b537f` |
| `addons/postprocessing/OutputPass.js` | `13817fc7a87f662d29d2c5e00f44d3a4588c9afac4a372de0cacb0e44e368ffd` | `1ae50319ebb75055eb8c33043808b4ef3350a5dc270ed272800b90242183b3d5` |
| `addons/postprocessing/Pass.js` | `b3c6128340eaa37e40a6a2f1b738e894c855239417d50959759b34a2b5e89f92` | `8849b45aa211656589a7fe8fe23b5d2efe12ef0782e998d8747fd2bc3d829e35` |
| `addons/postprocessing/RenderPass.js` | `1c90c085312871c4bcdccfcf519499c6276dd503363fcf7cb7f703add45cf4a2` | `b598595dc954db43bfcad6a271d3e1c346496b416943f6ac0d78be7504eb3986` |
| `addons/postprocessing/ShaderPass.js` | `3b28a1ee27e0eb96c0eab137a1f442ccf127a926904eced2d51e125ec44af781` | `f4fd1b5179ed02ec7087d6616a37a862afe8b2c1e34a236b392bd0bc00004edb` |
| `addons/postprocessing/SMAAPass.js` | `f3508e3e17f40c1358921b5c7eb3ab60460d97b06fdadf6b0d40b52d3842c44a` | `64c002a33c83b1f7f57ae29cd890d27fddbe0c92e3518e01112ae5d11987cf61` |
| `addons/postprocessing/UnrealBloomPass.js` | `8f09315c0cec117a0ca2494d3e3586035b3c4323d6dcb037537cc51b04c3cdba` | `c55fa6f4b2cda2cad4906916e981963a4708656d377fb47a6c3537b106437140` |
| `addons/shaders/CopyShader.js` | `4e3346db194db56a596cd074e9bdb39fb5eb52040c333e0d29dc4eb1324d3b1d` | `4e3346db194db56a596cd074e9bdb39fb5eb52040c333e0d29dc4eb1324d3b1d` |
| `addons/shaders/FXAAShader.js` | `e25c46db03ac2420d9291ff202112464cc9cf5114efc8477cc0a59c65653d4aa` | `c93c361fece80066b73fe2afbca3cbb559dcb864934376afe0790aba145d4f22` |
| `addons/shaders/LuminosityHighPassShader.js` | `3d841cc594a0c1767d1b0185720b32761a0133c5f1b70b56658e28f2fb9b7900` | `979bb8227b966ee03bd7f9785280b55ed367a40dd02a82c5e59134378ef8d174` |
| `addons/shaders/OutputShader.js` | `53a52e430c27bc36ceaab8ae90a2b4af7b02672d7ee4b29d6ba3c28e09c92c2a` | `53a52e430c27bc36ceaab8ae90a2b4af7b02672d7ee4b29d6ba3c28e09c92c2a` |
| `addons/shaders/SMAAShader.js` | `3c7e942a25cb09dd431e395e6e91904715a834b2a6e62ec0b9b77c2f8655c369` | `e9ad996d4b30dd2c1502ece411fae089cb0bf0d3b5ce11932548ddff9aa71c83` |

Verify the patched tree with:

```sh
shasum -a 256 web/wwwroot/vendor/three/addons/postprocessing/*.js
shasum -a 256 web/wwwroot/vendor/three/addons/shaders/*.js
```
