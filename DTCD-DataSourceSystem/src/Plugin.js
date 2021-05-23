import {
  SystemPlugin,
  LogSystemAdapter,
  EventSystemAdapter,
  InProgressError,
} from './../../DTCD-SDK';
import {pluginMeta} from './../package.json';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #logSystem;
  #eventSystem;

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#eventSystem = new EventSystemAdapter();
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
      this.#logSystem.warn();
      throw new Error();
    }

    try {
      const {type} = initData;
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

      const {plugin: dataSourceExtension} = this.getExtensions('DataSourceSystem')[0];
      const dataSourceInstance = new dataSourceExtension(initData);

      const isInited = await dataSourceInstance.init();
      if (!isInited) throw new Error("Job isn't created");
      return dataSourceInstance;
    } catch (err) {
      throw err;
    }
  }
}
