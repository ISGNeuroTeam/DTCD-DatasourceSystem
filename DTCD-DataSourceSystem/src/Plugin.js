import {SystemPlugin, LogSystemAdapter} from './../../DTCD-SDK/index';
import pluginMeta from './Plugin.Meta';

export class DataSourceSystem extends SystemPlugin {
  #logSystem;
  #systemName;

  constructor(guid) {
    super();
    this.#systemName = `${pluginMeta.name}[${guid}]`;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#logSystem.info(`${this.#systemName} initialization complete`);
  }

  get #extensions() {
    const extension = this.getExtensions(pluginMeta.name);
    return Array.isArray(extension) ? extension : [];
  }

  get dataSourceTypes() {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  createDataSource(type) {
    try {
      this.#logSystem.debug(`${this.#systemName} createDataSource(${type})`);

      if (typeof type === undefined) {
        throw new Error('DataSource type must be defined');
      } else if (typeof type !== 'string') {
        throw new Error('DataSource type must be a string');
      }

      const dataSourcePlugin = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!dataSourcePlugin) {
        throw new Error(`Cannot find "${type}" DataSource`);
      }

      return this.installPlugin(dataSourcePlugin.name).ds;
    } catch (err) {
      this.#logSystem.debug(`${this.#systemName} createDataSource() error: ${err.stack}`);
      this.#logSystem.info(`${this.#systemName} DataSource creation error: ${err.message}`);
      throw err;
    }
  }

  static getRegistrationMeta() {
    return pluginMeta;
  }
}
