import fs, { existsSync, watch } from 'fs'
import { join, resolve } from 'path'
import * as os from 'os'
import syntaxerror from 'syntax-error'
import importFile from './import.js'
import Helper from './helper.js'

const __dirname = Helper.__dirname(import.meta)
const rootDirectory = Helper.__dirname(join(__dirname, '../'))
const pluginFolder = Helper.__dirname(join(__dirname, '../plugins'))
const pluginFilter = filename => /\.(mc)?js$/.test(filename)


let watcher = {},
	plugins = {},
	pluginFolders = []


async function loadPluginFiles(
	pluginFolder = pluginFolder,
	pluginFilter = pluginFilter,
	opts = { recursiveRead: false }) {

	const folder = resolve(pluginFolder)
	if (folder in watcher) return
	pluginFolders.push(folder)

	const paths = await fs.promises.readdir(pluginFolder)
	await Promise.all(paths.map(async path => {
		const resolved = join(folder, path)
		const dirname = Helper.__filename(resolved, true)
		const formatedFilename = formatFilename(resolved)
		try {
			const stats = await fs.promises.lstat(dirname)
			if (!stats.isFile()) {
				if (opts.recursiveRead) await loadPluginFiles(dirname, pluginFilter, opts)
				return
			}
			const filename = Helper.__filename(resolved)
			const isValidFile = pluginFilter(filename)
			if (!isValidFile) return
			const module = await importFile(filename)
			if (module) plugins[formatedFilename] = module
		} catch (e) {
			opts.logger?.error(e, `error while requiring ${formatedFilename}`)
			delete plugins[formatedFilename]
		}
	}))


	const watching = watch(folder, reload.bind(null, {
		logger: opts.logger,
		pluginFolder,
		pluginFilter
	}))
	watching.on('close', () => deletePluginFolder(folder, true))
	watcher[folder] = watching

	return plugins = sortedPlugins(plugins)
}

function deletePluginFolder(folder, isAlreadyClosed = false) {
	const resolved = resolve(folder)
	if (!(resolved in watcher)) return
	if (!isAlreadyClosed) watcher[resolved].close()
	delete watcher[resolved]
	pluginFolders.splice(pluginFolders.indexOf(resolved), 1)
}

async function reload({
	logger,
	pluginFolder = pluginFolder,
	pluginFilter = pluginFilter
}, _ev, filename) {
	if (pluginFilter(filename)) {
		const file = Helper.__filename(join(pluginFolder, filename), true)
		const formatedFilename = formatFilename(file)
		if (formatedFilename in plugins) {
			if (existsSync(file)) logger?.info(`updated plugin - '${formatedFilename}'`)
			else {
				logger?.warn(`deleted plugin - '${formatedFilename}'`)
				return delete plugins[formatedFilename]
			}
		} else logger?.info(`new plugin - '${formatedFilename}'`)
		const src = await fs.promises.readFile(file)
		let err = syntaxerror(src, filename, {
			sourceType: 'module',
			allowAwaitOutsideFunction: true
		})
		if (err) logger?.error(err, `syntax error while loading '${formatedFilename}'`)
		else try {
			const module = await importFile(file)
			if (module) plugins[formatedFilename] = module
		} catch (e) {
			logger?.error(e, `error require plugin '${formatedFilename}'`)
			delete plugins[formatedFilename]
		} finally {
			plugins = sortedPlugins(plugins)
		}
	}
}

function formatFilename(filename) {
	let dir = join(rootDirectory, './')
	if (os.platform() === 'win32') dir = dir.replace(/\\/g, '\\\\')
	const regex = new RegExp(`^${dir}`)
	const formated = filename.replace(regex, '')
	return formated
}

function sortedPlugins(plugins) {
	return Object.fromEntries(Object.entries(plugins).sort(([a], [b]) => a.localeCompare(b)))
}

export {
	pluginFolder,
	pluginFilter,

	plugins,
	watcher,
	pluginFolders,

	loadPluginFiles,
	deletePluginFolder,
	reload
}