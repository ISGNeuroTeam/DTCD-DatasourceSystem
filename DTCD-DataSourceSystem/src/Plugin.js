import {
  SystemPlugin,
  LogSystemAdapter,
  EventSystemAdapter,
  InProgressError,
} from './../../DTCD-SDK/index';
import pluginMeta from './Plugin.Meta';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #logSystem;
  #systemName;
  #eventSystem;

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#systemName = `${pluginMeta.name}[${guid}]`;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#eventSystem = new EventSystemAdapter();
    this.#logSystem.info(`${this.#systemName} initialization complete`);
  }

  get #extensions() {
    const extension = this.getExtensions(pluginMeta.name);
    return Array.isArray(extension) ? extension : [];
  }

  get dataSourceTypes() {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  async createDataSource(initData = null) {
    if (initData === null) {
      this.#logSystem.warn(
        `Warning ${this.#systemName}: createDataSource called without initial object`
      );
      throw new Error(
        `Warning ${this.#systemName}: createDataSource called without initial object`
      );
    }

    try {
      const {type} = initData;
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

      const dataSourceInstance = this.installExtension(
        'DataSourceSystem',
        dataSourcePlugin.name,
        initData
      );

      const isInited = await dataSourceInstance.init();
      if (!isInited) throw new Error("Job isn't created");
      return dataSourceInstance;
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
