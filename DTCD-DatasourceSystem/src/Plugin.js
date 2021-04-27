import { SystemPlugin, LogSystemAdapter } from 'SDK';
import pluginMeta from './Plugin.Meta';

export class DatasourceSystem extends SystemPlugin {

  #logSystem;
  #systemName;

  constructor (guid) {
    super();
    this.#systemName = `${pluginMeta.name}[${guid}]`
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#logSystem.info(`${this.#systemName} initialization complete`);
  }

  get #extensions () {
    const extension = this.getExtensions(pluginMeta.name);
    return Array.isArray(extension) ? extension : [];
  }

  get datasourceTypes () {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  createDatasource (type) {
    try {
      this.#logSystem.debug(`${this.#systemName} createDatasource(${type})`);

      if (typeof type === undefined) {
        throw new Error('Datasource type must be defined');
      } else if (typeof type !== 'string') {
        throw new Error('Datasource type must be a string');
      }

      const datasourcePlugin = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!datasourcePlugin) {
        throw new Error(`Cannot find "${type}" datasource`);
      }

      return this.installPlugin(datasourcePlugin.name).ds;
    } catch (err) {
      this.#logSystem.debug(`${this.#systemName} createDatasource() error: ${err.stack}`);
      this.#logSystem.info(`${this.#systemName} datasource creation error: ${err.message}`);
      throw err;
    }
  }

  static getRegistrationMeta () {
    return pluginMeta;
  }

}
