"use strict"
const os = require("os")
const fs = require("fs")
const path = require('path')
const url = require("url")
const http = require("http")
const electron = require("electron")
const ipcMain = require('electron').ipcMain
const dialog = require('electron').dialog;
const app = electron.app
const BrowserWindow = electron.BrowserWindow

const mainWindowConfig = {
  width: 1200,
  height: 600,
  minWidth: 850,
  minHeight: 500,
  "title-bar-style": "hidden"
}
const mainWindowHtmlPath = `file://${__dirname}/pages/main/index.html`

let mainWindow = null

electron.crashReporter.start()

app.on("ready", function() {
  openMainWindow()
})

function openMainWindow () {
  mainWindow = new BrowserWindow(mainWindowConfig)
  mainWindow.loadURL(mainWindowHtmlPath)
  // mainWindow.webContents.openDevTools()
  mainWindow.on("closed", function() {
    mainWindow = null
  })
}


let downloadList = []
let nowDownloading;
function downloadFile (source, dir) {
  downloadList.push({source, dir})
  startDownLoad()
}

function fileName (source, dir) {
  let pathname = url.parse(source).pathname
  let pathObject = path.parse(pathname)
  let dirFiles = fs.readdirSync(dir)
  let fileName = pathObject.base
  if (dirFiles.indexOf(fileName) === -1) return fileName

  let index = 0
  while (fileName = pathObject.name + '_' + (++index) + pathObject.ext) {
    if (dirFiles.indexOf(fileName) === -1) return fileName    
  }
}

function startDownLoad () {
  if (nowDownloading) return
  nowDownloading = downloadList.shift()
  if (!nowDownloading) return

  let source = nowDownloading.source
  let dir = nowDownloading.dir

  http.request(url.parse(source), (res) => {
    let filePath = dir + '/' + fileName(source, dir)
    let fileLoadingPath = filePath + '.download'
    let file = fs.createWriteStream(fileLoadingPath)
    res.pipe(file)
    res.on("end", () => {
      fs.renameSync(fileLoadingPath, filePath)
      nowDownloading = undefined
      startDownLoad()
    })
  }).end()
}

let downloadOptions = {
  title: "保存到文件夹",
  defaultPath: os.homedir() + "/Pictures",
  properties: ["createDirectory", "openDirectory"]
}
ipcMain.on('download', function(event, sources) {
  dialog.showOpenDialog(mainWindow, downloadOptions, (dirs) => {
    if (dirs && dirs[0]) 
      sources.forEach(source => downloadFile(source, dirs[0]))
  })
});