import {SystemPlugin, LogSystemAdapter, EventSystemAdapter} from './../../DTCD-SDK/index';
import {InProgressError} from './utils/InProgressError';
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

      const dataSourcePlugin = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type === type
      );

      if (!dataSourcePlugin) {
        throw new Error(`Cannot find "${type}" DataSource`);
      }

      const dataSourceInstance = this.installExtension('DataSourceSystem', dataSourcePlugin.name, {
        tws,
        twf,
        original_otl: search,
        cache_ttl: cacheTime,
      });
      const isInited = await dataSourceInstance.init();
      if (!isInited) throw new Error("Job isn't created");

      // Override methods with returns Pomises for eventsystem callbacks
      for (let methodName of ['toDataset']) {
        // Method is Object type property, so "this" have value property
        dataSourceInstance[methodName] = new Proxy(dataSourceInstance[methodName], {
          apply: (target, thisArg, args) => {
            let result;
            if (!target.constructor.name === 'AsyncFunction') {
              target.status = 'complete';
              result = target.call(thisArg, ...args);
            } else {
              if (target.status === 'complete') {
                return target.value;
              } else if (target.status === 'inProgress') {
                throw new InProgressError(`${target.name} method with status "inProgress"`);
              }
              target.status = 'inProgress';
              result = target
                .call(thisArg, ...args)
                .then(res => {
                  target.value = res;
                  this.#eventSystem.createAndPublish(this.#guid, 'DataSourceMethodFinished');
                  target.status = 'complete';
                })
                .catch(err => {
                  throw new Error(err);
                });
              throw new InProgressError(`${target.name} method with status "inProgress"`);
            }
            return result;
          },
        });
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
