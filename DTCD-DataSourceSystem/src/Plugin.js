import {SystemPlugin, LogSystemAdapter, StorageSystemAdapter} from './../../DTCD-SDK';
import {DataSource} from './libs/DataSource';
import {pluginMeta} from './../package.json';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #extensions;
  #logSystem;
  #storageSystem;

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#storageSystem = new StorageSystemAdapter();

    this.#extensions = this.getExtensions(pluginMeta.name);
    this.#logSystem.debug(`DataSourceSystem instance created!`);
  }

  get dataSourceTypes() {
    this.#logSystem.debug(`DataSourceSystem get dataSourceTypes`);
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  async createDataSource(initData = null) {
    this.#logSystem.debug(`DataSourceSystem start create createDataSource`);
    try {
      const {type, name} = initData;
      if (typeof type !== 'string' || typeof name !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - "${type}", name - "${name}"`
        );
        throw new Error('Initial object should have "type" and "name" string properties');
      }
      this.#logSystem.debug(
        `Started create of DataSource with type - "${type}" and name - "${name}"`
      );

      const {plugin: ExternalSource} = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!ExternalSource) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      const externalSource = new ExternalSource(initData);
      this.#logSystem.debug(`ExternalSource instance created`);

      const isInited = await externalSource.init();
      if (!isInited) {
        this.#logSystem.error(`Couldn't init ExternalSource instance`);
        throw new Error("Job isn't created");
      }
      this.#logSystem.debug(`ExternalSource instance inited`);

      const externalSourceIterator = externalSource[Symbol.asyncIterator]();
      this.#logSystem.debug(`get ExternalSource iterator`);

      this.#storageSystem.session.addRecord(name, []);
      this.#logSystem.debug(`Added record to StorageSystem for ExternalSource`);
      const storageRecord = this.#storageSystem.session.getRecord(name);
      this.#logSystem.debug(`Get record from StorageSystem for ExternalSource`);

      const baseDataSource = new DataSource(externalSourceIterator);
      this.#logSystem.debug(`Inited DataSource instance based on ExternalSource`);

      baseDataSource[Symbol.asyncIterator] = () => ({
        iterator: externalSourceIterator,
        currentIndex: 0,
        storageRecord,
        logSystem: this.#logSystem,
        async next() {
          if (this.currentIndex < this.storageRecord.length) {
            this.logSystem.debug(`Getting record by dataSourceIterator from StorageSystem`);
            const result = {done: false, value: this.storageRecord[this.currentIndex]};
            this.currentIndex += 1;
            return result;
          } else {
            this.logSystem.debug(`Getting record by dataSourceIterator from ExternalDataSource`);
            const {value, done} = await this.iterator.next();
            if (typeof value !== 'undefined') {
              this.logSystem.debug(`Value recieved from ExternalDataSource`);
              this.storageRecord.push(value);
              this.logSystem.debug(`Pushed new record from ExternalDataSource into StorageSystem `);
              this.currentIndex += 1;
            }
            return {value, done};
          }
        },
      });
      this.#logSystem.debug(
        `Inited baseDataSource [Symbol.asyncIterator] method based on externalSourceIterator.`
      );

      const baseDataSourceIterator = baseDataSource[Symbol.asyncIterator]();
      this.#logSystem.debug(`Received aseDataSourceIterator.`);

      await baseDataSourceIterator.next();
      this.#logSystem.debug(`Received first record from dataSourceIterator`);

      return baseDataSource;
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }
}
