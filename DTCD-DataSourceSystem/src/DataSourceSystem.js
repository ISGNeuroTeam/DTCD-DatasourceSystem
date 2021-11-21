import {
  SystemPlugin,
  LogSystemAdapter,
  StorageSystemAdapter,
  EventSystemAdapter,
} from '../../DTCD-SDK';
// import { DataSource } from './libs/DataSource';
import { pluginMeta } from '../package.json';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #extensions;
  #logSystem;
  #storageSystem;
  #eventSystem;
  #sources;

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#storageSystem = new StorageSystemAdapter();
    this.#eventSystem = new EventSystemAdapter(guid);
    this.#extensions = this.getExtensions(pluginMeta.name);

    this.#sources = {};

    this.#logSystem.debug(`DataSourceSystem instance created!`);
  }

  getPluginConfig() {
    const sources = {};
    for (let source in this.#sources) {
      const { initData, type } = this.#sources[source];
      sources[source] = { initData, type };
    }
    return { sources };
  }

  setPluginConfig(config = {}) {
    if (config.sources)
      for (let source in config.sources) {
        const { initData } = config.sources[source];
        this.createDataSource({ name: source, ...initData });
      }
  }

  getFormSettings() {}

  setFormSettings() {}

  beforeDelete() {}

  #toCache(keyRecord, data) {
    if (!this.#storageSystem.session.hasRecord(keyRecord)) {
      this.#storageSystem.session.addRecord(keyRecord, data);
      this.#logSystem.debug(`Added record to StorageSystem for ExternalSource`);
    } else this.#storageSystem.session.putRecord(keyRecord, data);
  }

  get dataSourceTypes() {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  createDataSource(initData) {
    this.#logSystem.debug(`DataSourceSystem start create createDataSource`);
    try {
      let { type, name } = initData;
      delete initData.name;

      if (typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - "${type}", name - "${name}"`
        );
        throw new Error('Initial object should have "type" and "name" string properties');
      }

      if (this.#sources.hasOwnProperty(name)) {
        this.#logSystem.error(`Datasource with name '${name} already exists!`);
        console.error(`Datasource with name '${name} already exists!`);
        return;
      }

      this.#logSystem.debug(
        `Started create of DataSource with type - "${type}" and name - "${name}"`
      );

      const { plugin: DataSourcePlugin } = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!DataSourcePlugin) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      // DATASOURCE-PLUGIN
      const dataSource = new DataSourcePlugin(initData);
      this.#logSystem.debug(`ExternalSource instance created`);

      // // CACHING
      // this.#toCache(name, iterablePlugin); // name is keyword into storage
      // this.#logSystem.debug(`Instance of IterableExtension cached`);

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'new',
      });

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'success',
      });

      this.#sources[name] = { source: dataSource, initData, type, status: 'new' };
      this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
        dataSource: name,
        status: 'new',
      });
      this.#logSystem.debug(`ExternalSource instance inited`);

      this.runDataSource(name);

      return true;
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }

  runDataSource(name) {
    this.#sources[name].source
      .init()
      .then(isInited => {
        if (!isInited) {
          this.#logSystem.error(`Couldn't init ExternalSource instance`);
          throw new Error("Job isn't created");
        }
        return this.#sources[name].source.getData();
      })
      .then(data => {
        this.#toCache(name, data);

        this.#sources[name].status = 'success';

        this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
          dataSource: name,
          status: 'success',
        });
      });
  }

  editDataSource(name, params) {
    this.#sources[name].initData = { ...this.#sources[name].initData, ...params };
    this.#sources[name].source.editParams(params);
    this.runDataSource(name);
  }

  getDataSource(name) {
    if (this.#sources.hasOwnProperty(name)) return this.#sources[name];
    return null;
  }

  removeDataSource(name) {
    delete this.#sources[name];
  }

  getDataSourceList() {
    return this.#sources;
  }
}
