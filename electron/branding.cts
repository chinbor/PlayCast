import path from 'node:path';
import fs from 'node:fs';
import brand from '../app-brand.json';


const builtIcon=path.join(__dirname,'../dist/assets/brand/playcast.ico')
// Vite copies public assets into dist. A fresh development checkout also works
// before its first build. Keep package.name as the established identity;
// runtime.cjs pins the storage paths before setting the public app name.
const APP_ICON=fs.existsSync(builtIcon)?builtIcon:path.join(__dirname,'../public/assets/brand/playcast.ico')
const {name,englishName,title}=brand;
export {name,englishName,title,APP_ICON};
