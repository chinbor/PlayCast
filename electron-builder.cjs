const brand=require('./app-brand.json')

module.exports={
 appId:'com.playcast.desktop',
 productName:brand.title,
 directories:{output:'release'},
 asar:true,
 compression:'maximum',
 electronLanguages:['en-US','zh-CN','zh-TW'],
 // Ship runtime code/assets only: no tests, design sources or user profiles.
 files:['dist/**/*','electron/**/*.cjs','app-brand.json','package.json','LICENSE','THIRD_PARTY_NOTICES.md'],
 win:{
  target:[{target:'nsis',arch:['x64']}],
  executableName:'PlayCast',
  icon:'public/assets/brand/playcast.ico',
  artifactName:'PlayCast-Setup-${version}-${arch}.${ext}',
 },
 nsis:{
  oneClick:false,
  perMachine:false,
  allowElevation:false,
  allowToChangeInstallationDirectory:true,
  deleteAppDataOnUninstall:false,
  createDesktopShortcut:true,
  createStartMenuShortcut:true,
  shortcutName:brand.title,
  installerIcon:'public/assets/brand/playcast.ico',
  uninstallerIcon:'public/assets/brand/playcast.ico',
  differentialPackage:false,
  runAfterFinish:false,
  language:'2052',
 },
 forceCodeSigning:false,
 publish:null,
}
