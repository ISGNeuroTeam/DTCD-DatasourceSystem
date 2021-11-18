import {
  SystemPlugin,
  LogSystemAdapter,
  StorageSystemAdapter,
  EventSystemAdapter,
} from '../../DTCD-SDK';
import { DataSource } from './libs/DataSource';
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

    this.#sources = [];

    this.#logSystem.debug(`DataSourceSystem instance created!`);
  }

  getPluginConfig() {
    const sources = [];
    for (let source of this.#sources) {
      const { initData, name, type } = source;
      sources.push({ initData, name, type });
    }
    return { sources };
  }

  setPluginConfig(config = {}) {
    config.sources.forEach(({ initData }) => {
      this.createDataSource(initData);
    });
  }

  getFormSettings() {}

  setFormSettings() {}

  beforeDelete() {}

  #checkSourceNameExists(name) {
    const index = this.#sources.indexOf(src => src.name === name);
    return index !== -1;
  }

  #toCache(keyRecord, dataSource) {
    if (!this.#storageSystem.session.hasRecord(keyRecord)) {
      this.#storageSystem.session.addRecord(keyRecord, []);
      this.#logSystem.debug(`Added record to StorageSystem for ExternalSource`);
    } else this.#storageSystem.session.putRecord(keyRecord, []);

    const externalSourceIterator = dataSource[Symbol.iterator]();
    this.#logSystem.debug(`get ExternalSource iterator`);

    const storageRecord = this.#storageSystem.session.getRecord(keyRecord);
    this.#logSystem.debug(`Get record from StorageSystem for ExternalSource`);

    dataSource[Symbol.iterator] = () => {
      return {
        iterator: externalSourceIterator,
        currentIndex: 0,
        storageRecord,
        next() {
          if (this.currentIndex < this.storageRecord.length) {
            const result = { done: false, value: this.storageRecord[this.currentIndex] };
            this.currentIndex++;
            return result;
          } else {
            const { value, done } = this.iterator.next();
            if (typeof value !== 'undefined') {
              this.storageRecord.push(value);
              this.currentIndex++;
            }
            return { value, done };
          }
        },
      };
    };

    return dataSource;
  }

  get dataSourceTypes() {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  createDataSource(initData) {
    this.#logSystem.debug(`DataSourceSystem start create createDataSource`);
    try {
      let { type, name } = initData;

      if (typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - "${type}", name - "${name}"`
        );
        throw new Error('Initial object should have "type" and "name" string properties');
      }

      // SETTING-DATASOURCE-NAME
      if (typeof name !== 'string') {
        const prefix = 'DataSource-';
        let sourceNameCandidate;
        do {
          let nextIndex = Object.keys(this.#sources).length;
          sourceNameCandidate = prefix + nextIndex;
          nextIndex++;
        } while (this.#checkSourceNameExists(sourceNameCandidate));
        name = sourceNameCandidate;
      }
      this.#logSystem.debug(
        `Started create of DataSource with type - "${type}" and name - "${name}"`
      );

      const { plugin: IterableExtensionPlugin } = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!IterableExtensionPlugin) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      // DATASOURCE-PLUGIN INSTANCE
      const iterablePlugin = new IterableExtensionPlugin(initData);
      this.#logSystem.debug(`ExternalSource instance created`);

      // CACHING
      this.#toCache(name, iterablePlugin); // name is keyword into storage
      this.#logSystem.debug(`Instance of IterableExtension cached`);

      // EVENT-SYSTEM
      ['UPDATE'].forEach(evtType => {
        this.#eventSystem.registerEvent(`${name}-${evtType}`);
      });
      const dataSource = new DataSource(iterablePlugin);
      iterablePlugin.init().then(isInited => {
        if (!isInited) {
          this.#logSystem.error(`Couldn't init ExternalSource instance`);
          throw new Error("Job isn't created");
        }
        this.#eventSystem.publishEvent(`${name}-UPDATE`, dataSource);
        this.#logSystem.debug(`ExternalSource instance inited`);
      });

      this.#sources.push({ source: dataSource, initData, name, type });
      return dataSource;
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }

  getDataSource(name) {
    const source = this.#sources.find(src => src.name === name);
    if (source) return source;
  }

  removeDataSource(name) {
    return delete this.#sources[this.#sources.findIndex(src => src.name === name)];
  }

  getDataSourceList() {
    return this.#sources;
  }
}
