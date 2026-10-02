const path=require('node:path'),fs=require('node:fs')
const brand=require('../app-brand.json')
const builtIcon=path.join(__dirname,'../dist/assets/brand/playcast.ico')
// Vite copies public assets into dist. A fresh development checkout also works
// before its first build. Keep package.name as the established identity;
// runtime.cjs pins the storage paths before setting the public app name.
const APP_ICON=fs.existsSync(builtIcon)?builtIcon:path.join(__dirname,'../public/assets/brand/playcast.ico')
module.exports={...brand,APP_ICON}
