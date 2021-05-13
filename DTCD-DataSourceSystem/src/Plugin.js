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
      const {type, tws, twf, search, cacheTime = 100, isRun = true} = initData;
      this.#logSystem.debug(`${this.#systemName} createDataSource(${type})`);
      if (typeof type === undefined) {
        throw new Error('DataSource type must be defined');
      } else if (typeof type !== 'string') {
        throw new Error('DataSource type must be a string');
      }

      const {plugin: dataSourcePlugin = null} = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!dataSourcePlugin) {
        throw new Error(`Cannot find "${type}" DataSource`);
      }

      const dataSourceInstance = new dataSourcePlugin(this.#guid, {
        tws,
        twf,
        original_otl: search,
        cache_ttl: cacheTime,
      });

      const isInited = await dataSourceInstance.init();
      if (!isInited) throw new Error("Job isn't created");

      const asyncMethodDecorator = (
        targetFunc,
        dataSourceInstance,
        eventSystem,
        dataSourceSystemGUID
      ) => {
        return function syncFunction(...args) {
          if (this.status === 'complete') {
            return this.value;
          } else if (this.status === 'inProgress') {
            throw new InProgressError(`${targetFunc.name} method with status "inProgress"`);
          }
          this.status = 'inProgress';
          targetFunc
            .apply(dataSourceInstance, args)
            .then(res => {
              this.value = res;
              this.status = 'complete';
              eventSystem.createAndPublish(dataSourceSystemGUID, 'DataSourceMethodFinished');
            })
            .catch(err => {
              throw new Error(err);
            });
          throw new InProgressError(`${targetFunc.name} method with status "inProgress"`);
        };
      };

      // Override methods with returns Pomises for eventsystem callbacks
      for (let methodName of ['getRows']) {
        const func = dataSourceInstance[methodName];
        if (typeof func === 'function') {
          if (func.constructor.name === 'AsyncFunction') {
            dataSourceInstance[methodName] = asyncMethodDecorator(
              func,
              dataSourceInstance,
              this.#eventSystem,
              this.#guid
            );
          }
        }
      }

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
