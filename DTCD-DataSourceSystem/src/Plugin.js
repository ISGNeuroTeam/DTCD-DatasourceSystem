import {SystemPlugin, LogSystemAdapter, StorageSystemAdapter} from './../../DTCD-SDK';
import {DataSource} from './libs/DataSource';
import {pluginMeta} from './../package.json';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #extensions;
  #logSystem;
  #storageSystem;
  #sources;

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter(guid, pluginMeta.name);
    this.#storageSystem = new StorageSystemAdapter();
    this.#extensions = this.getExtensions(pluginMeta.name);

    this.#sources = {};

    this.#logSystem.debug(`DataSourceSystem instance created!`);
  }

  #checkSourceNameExists(name) {
    return Object.keys(this.#sources).includes(name);
  }

  get dataSourceTypes() {
    return ['OTL'];
  }

  async createDataSource(initData) {
    this.#logSystem.debug(`DataSourceSystem start create createDataSource`);
    try {
      let {type, name} = initData;

      if (typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - "${type}", name - "${name}"`
        );
        throw new Error('Initial object should have "type" and "name" string properties');
      }

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

      const externalSourceIterator = externalSource[Symbol.iterator]();
      this.#logSystem.debug(`get ExternalSource iterator`);
      if (!this.#storageSystem.session.hasRecord(name)) {
        this.#storageSystem.session.addRecord(name, []);
        this.#logSystem.debug(`Added record to StorageSystem for ExternalSource`);
      } else this.#storageSystem.session.putRecord(name, []);

      const storageRecord = this.#storageSystem.session.getRecord(name);
      this.#logSystem.debug(`Get record from StorageSystem for ExternalSource`);

      const baseDataSource = new DataSource(externalSourceIterator);
      this.#logSystem.debug(`Inited DataSource instance based on ExternalSource`);

      baseDataSource[Symbol.iterator] = () => ({
        iterator: externalSourceIterator,
        currentIndex: 0,
        storageRecord,
        next() {
          if (this.currentIndex < this.storageRecord.length) {
            const result = {done: false, value: this.storageRecord[this.currentIndex]};
            this.currentIndex++;
            return result;
          } else {
            const {value, done} = this.iterator.next();
            if (typeof value !== 'undefined') {
              this.storageRecord.push(value);
              this.currentIndex++;
            }
            return {value, done};
          }
        },
      });

      this.#logSystem.debug(
        `Inited baseDataSource [Symbol.iterator] method based on externalSourceIterator.`
      );

      const baseDataSourceIterator = baseDataSource[Symbol.iterator]();
      this.#logSystem.debug(`Received aseDataSourceIterator.`);
      baseDataSourceIterator.next();

      this.#logSystem.debug(`Received first record from dataSourceIterator`);

      return baseDataSource;
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }
}
