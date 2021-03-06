import { menubar } from "menubar"
import path from "path"
import { ipcMain, dialog, app } from "electron"
import detectPort from "detect-port"
import express from "express"
import serveStatic from "serve-static"
import {
  hasGatsbyInstalled,
  loadPackageJson,
  hasGatsbyDependency,
} from "./utils"

const dir = path.resolve(__dirname, `..`)

async function start(): Promise<void> {
  /**
   * Start a static server to serve the app's resources.
   * Gatsby doesn't like being served from a file URL
   */
  const port = await detectPort(9099)

  express()
    .use(serveStatic(path.resolve(dir, `public`)))
    .listen(port)

  const mb = menubar({
    dir,
    icon: path.resolve(dir, `assets`, `IconTemplate.png`),
    // If we're running develop we pass in a URL, otherwise use the one
    // of the express server we just started
    index: process.env.GATSBY_DEVELOP_URL || `http://localhost:${port}`,
    browserWindow: {
      webPreferences: {
        nodeIntegrationInWorker: true,
        nodeIntegration: true,
      },
    },
  })

  const childPids = new Set<number>()

  ipcMain.on(`add-child-pid`, (event, payload: number) => {
    childPids.add(payload)
  })

  ipcMain.on(`remove-child-pid`, (event, payload: number) => {
    childPids.delete(payload)
  })

  app.on(`before-quit`, () => {
    childPids.forEach((pid) => process.kill(pid))
  })

  ipcMain.on(`quit-app`, () => {
    app.quit()
  })

  // This request comes from the renderer
  ipcMain.handle(`browse-for-site`, async () => {
    console.log(`Browsing for site`)
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: [`openDirectory`],
    })
    if (canceled || !filePaths?.length) {
      return undefined
    }

    const path = filePaths[0]
    try {
      const packageJson = await loadPackageJson(path)
      // i.e. actually installed in node_modules
      if (await hasGatsbyInstalled(path)) {
        return { packageJson, path }
      }
      // Has a dependency but it hasn't been installed
      if (hasGatsbyDependency(packageJson)) {
        return {
          packageJson,
          path,
          warning: `The site ${packageJson.name} is a Gatsby site, but needs dependencies to be installed before it can be started`,
        }
      }
    } catch (e) {
      console.log(e)
    }
    return {
      error: `The selected folder is not a Gatsby site. Please try another`,
    }
  })

  mb.on(`ready`, () => {
    console.log(`app is ready`)
  })
}

start()
