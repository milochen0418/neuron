import { app, Menu } from 'electron'
import 'reflect-metadata'

import initApp from './startup/initApp'
import createWindow from './startup/createWindow'
import createSyncBlockTask from './startup/syncBlockTask/create'

import i18n from './utils/i18n'
import mainmenu from './utils/mainmenu'

let mainWindow: Electron.BrowserWindow | null

const openWindow = () => {
  i18n.changeLanguage(app.getLocale())
  Menu.setApplicationMenu(mainmenu())
  if (!mainWindow) {
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      if (mainWindow) {
        mainWindow = null
      }
    })
  }
}

app.on('ready', () => {
  initApp()
  openWindow()
  createSyncBlockTask()
})

app.on('activate', openWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
